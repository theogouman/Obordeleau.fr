import { getTranslations } from 'next-intl/server';
import { NextResponse, type NextRequest } from 'next/server';
import { routing, type Locale } from '@/i18n/routing';
import { MIN_NIGHTS, firstBookableDate, reserve } from '@/lib/availability';
import { isIsoDate, nightsBetween } from '@/lib/dates';
import { formattedAddress, host, property } from '@/lib/content';
import {
  formatEmailDate,
  hostInbox as resolveHostInbox,
  renderEmail,
  sendEmail,
  type Detail,
} from '@/lib/email';
import { bookingStoreConfigured } from '@/lib/supabase';

/**
 * FR-103: the direct booking write.
 *
 * The submitted range is checked here for shape, then re-checked in full by the
 * database, which inserts under an exclusion constraint. Two visitors
 * submitting the same free nights at the same instant: exactly one is written,
 * the other is told the dates have just gone (constitution VIII).
 *
 * No payment is taken (Phase 3), so the reservation is written straight to
 * `confirmed` and the nights are blocked everywhere from that moment.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type BookingPayload = {
  from?: string;
  to?: string;
  guests?: number;
  minors?: number;
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  consent?: boolean;
  locale?: string;
  company?: string;
  elapsedMs?: number;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_FIELD = 2000;
const MIN_FILL_MS = 2500;

/**
 * Best effort rate limit, as on the Phase 1 inquiry endpoint: serverless
 * instances get recycled, so the honeypot and the minimum fill time do most of
 * the work. Kept tighter here because every accepted call takes real inventory.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 3;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);

  if (hits.size > 5000) hits.clear();

  return recent.length > MAX_PER_WINDOW;
}

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return (forwarded?.split(',')[0] ?? 'unknown').trim();
}

function clean(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD);
}

function asLocale(value: unknown): Locale {
  const candidate = String(value);
  return (routing.locales as readonly string[]).includes(candidate)
    ? (candidate as Locale)
    : routing.defaultLocale;
}

export async function POST(request: NextRequest) {
  let payload: BookingPayload;

  try {
    payload = (await request.json()) as BookingPayload;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  // Honeypot and too-fast submissions: answer 200 so bots learn nothing, and
  // above all write nothing.
  if (clean(payload.company) !== '') {
    return NextResponse.json({ ok: true });
  }
  if (typeof payload.elapsedMs === 'number' && payload.elapsedMs < MIN_FILL_MS) {
    return NextResponse.json({ ok: true });
  }

  if (rateLimited(clientKey(request))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const name = clean(payload.name);
  const email = clean(payload.email);
  const phone = clean(payload.phone);
  const message = clean(payload.message);
  const from = clean(payload.from);
  const to = clean(payload.to);
  const guests = Number(payload.guests);
  const minors = Number.isFinite(Number(payload.minors)) ? Number(payload.minors) : 0;
  const locale = asLocale(payload.locale);

  const problems: string[] = [];
  if (!name) problems.push('name');
  if (!email || !EMAIL_PATTERN.test(email)) problems.push('email');
  if (!isIsoDate(from)) problems.push('from');
  if (!isIsoDate(to)) problems.push('to');
  if (isIsoDate(from) && isIsoDate(to) && nightsBetween(from, to) < MIN_NIGHTS) {
    problems.push('dateOrder');
  }
  if (!Number.isFinite(guests) || guests < 1 || guests > property.capacity.maxGuests) {
    problems.push('guests');
  }
  // Strictly fewer than the party: a stay with no adult in it cannot be quoted
  // and cannot be let. The database refuses it too.
  if (!Number.isInteger(minors) || minors < 0 || (Number.isFinite(guests) && minors >= guests)) {
    problems.push('minors');
  }
  if (payload.consent !== true) problems.push('consent');

  if (problems.length > 0) {
    return NextResponse.json({ error: 'invalid', fields: problems }, { status: 400 });
  }

  if (!bookingStoreConfigured) {
    console.error('[reservations] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing');
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  let outcome: Awaited<ReturnType<typeof reserve>>;

  try {
    outcome = await reserve({
      guestName: name,
      guestEmail: email,
      startDate: from,
      endDate: to,
      partySize: guests,
      minors,
      notes: [phone ? `Tel: ${phone}` : null, message || null].filter(Boolean).join(' | ') || null,
      locale,
    });
  } catch (error) {
    console.error('[reservations] store unreachable', error);
    return NextResponse.json({ error: 'unavailable' }, { status: 502 });
  }

  if (!outcome.ok) {
    // 409 for "the nights went while you were typing", 400 for a rule the form
    // should have caught first.
    const status = outcome.reason === 'unavailable' ? 409 : 400;
    return NextResponse.json(
      {
        error: outcome.reason,
        firstArrival: outcome.minArrival ?? firstBookableDate(),
        minNights: outcome.minNights ?? MIN_NIGHTS,
      },
      { status },
    );
  }

  const nights = nightsBetween(from, to);
  const reference = outcome.id.slice(0, 8).toUpperCase();

  const labels = await getTranslations({ locale, namespace: 'emails.booking.labels' });
  const guestCopy = await getTranslations({ locale, namespace: 'emails.booking.guest' });
  // The host reads her own mail in French, whatever language the guest used.
  const hostLabels = await getTranslations({
    locale: routing.defaultLocale,
    namespace: 'emails.booking.labels',
  });
  const hostCopy = await getTranslations({
    locale: routing.defaultLocale,
    namespace: 'emails.booking.host',
  });

  const guestDetails: Detail[] = [
    { label: labels('arrival'), value: formatEmailDate(from, locale) },
    { label: labels('departure'), value: formatEmailDate(to, locale) },
    { label: labels('nights'), value: String(nights) },
    { label: labels('guests'), value: String(guests) },
    { label: labels('reference'), value: reference },
  ];

  const guestEmail = renderEmail(
    guestCopy('title'),
    guestCopy('intro', { name }),
    guestDetails,
    [
      guestCopy('address', { address: `${property.name}, ${formattedAddress}` }),
      guestCopy('noPayment'),
      guestCopy('changes'),
      guestCopy('signature', { host: host.firstName }),
    ],
  );

  const hostDetails: Detail[] = [
    { label: hostLabels('arrival'), value: formatEmailDate(from, routing.defaultLocale) },
    { label: hostLabels('departure'), value: formatEmailDate(to, routing.defaultLocale) },
    { label: hostLabels('nights'), value: String(nights) },
    {
      label: hostLabels('guests'),
      // The split matters: the tourist tax is charged per adult.
      value: minors > 0 ? `${guests} (${guests - minors} + ${minors} < 18)` : String(guests),
    },
    { label: hostLabels('name'), value: name },
    { label: hostLabels('email'), value: email },
    ...(phone ? [{ label: hostLabels('phone'), value: phone }] : []),
    ...(message ? [{ label: hostLabels('message'), value: message }] : []),
    { label: hostLabels('language'), value: locale },
    { label: hostLabels('reference'), value: reference },
  ];

  const hostEmail = renderEmail(hostCopy('title'), hostCopy('intro'), hostDetails, [
    hostCopy('blocked'),
  ]);

  const hostInbox = resolveHostInbox();

  // The nights are already taken at this point. A mail that fails to leave is
  // worth logging, never worth telling the visitor their booking did not happen.
  const [hostDelivered, guestDelivered] = await Promise.all([
    hostInbox
      ? sendEmail({
          to: [hostInbox],
          subject: hostCopy('subject', { from, to }),
          reply_to: email,
          ...hostEmail,
        }, 'reservations')
      : Promise.resolve(false),
    sendEmail({
      to: [email],
      subject: guestCopy('subject', { property: property.name }),
      ...(hostInbox ? { reply_to: hostInbox } : {}),
      ...guestEmail,
    }, 'reservations'),
  ]);

  if (!hostInbox) {
    console.error('[reservations] no BOOKINGS_TO_EMAIL or INQUIRY_TO_EMAIL, host not notified');
  }

  return NextResponse.json({
    ok: true,
    reference,
    from,
    to,
    nights,
    notified: { host: hostDelivered, guest: guestDelivered },
  });
}

export async function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
