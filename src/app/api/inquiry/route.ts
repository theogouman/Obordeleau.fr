import { NextResponse, type NextRequest } from 'next/server';
import { formattedAddress, host, property } from '@/lib/content';

/**
 * FR-015: the Phase 1 Direct path. It emails the host and stores nothing.
 * No payment, no database, no personal data in any URL (constitution VI).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type InquiryPayload = {
  arrival?: string;
  departure?: string;
  guests?: number;
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
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FIELD = 2000;
const MIN_FILL_MS = 2500;

/**
 * Best effort rate limit. Serverless instances are recycled, so this stops
 * naive floods rather than a determined attacker; the honeypot and the minimum
 * fill time carry the rest.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nightsBetween(arrival: string, departure: string): number {
  const start = Date.parse(`${arrival}T00:00:00Z`);
  const end = Date.parse(`${departure}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}

export async function POST(request: NextRequest) {
  let payload: InquiryPayload;

  try {
    payload = (await request.json()) as InquiryPayload;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  // Honeypot and too-fast submissions: answer 200 so bots learn nothing.
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
  const arrival = clean(payload.arrival);
  const departure = clean(payload.departure);
  const guests = Number(payload.guests);
  const locale = ['fr', 'en', 'de'].includes(String(payload.locale)) ? String(payload.locale) : 'fr';

  const problems: string[] = [];
  if (!name) problems.push('name');
  if (!email || !EMAIL_PATTERN.test(email)) problems.push('email');
  if (!DATE_PATTERN.test(arrival)) problems.push('arrival');
  if (!DATE_PATTERN.test(departure)) problems.push('departure');
  if (DATE_PATTERN.test(arrival) && DATE_PATTERN.test(departure) && departure <= arrival) {
    problems.push('dateOrder');
  }
  if (!Number.isFinite(guests) || guests < 1 || guests > property.capacity.maxGuests) {
    problems.push('guests');
  }
  if (payload.consent !== true) problems.push('consent');

  if (problems.length > 0) {
    return NextResponse.json({ error: 'invalid', fields: problems }, { status: 400 });
  }

  const nights = nightsBetween(arrival, departure);
  const subject = `Demande ${property.name}: ${arrival} au ${departure} (${guests} pers.)`;

  const lines = [
    `Arrivée: ${arrival}`,
    `Départ: ${departure}`,
    `Nuits: ${nights}`,
    `Voyageurs: ${guests}`,
    `Nom: ${name}`,
    `Email: ${email}`,
    phone ? `Téléphone: ${phone}` : null,
    `Langue du visiteur: ${locale}`,
    '',
    'Message:',
    message || '(aucun message)',
    '',
    `Logement: ${property.name}, ${formattedAddress}`,
  ].filter((line): line is string => line !== null);

  const text = lines.join('\n');
  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.6">${lines
    .map((line) => (line === '' ? '<br>' : `<p style="margin:0">${escapeHtml(line)}</p>`))
    .join('')}</div>`;

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env[host.inquiryRouting.toEnv] ?? process.env.INQUIRY_TO_EMAIL;
  const from = process.env.INQUIRY_FROM_EMAIL;

  if (!apiKey || !to || !from) {
    if (process.env.NODE_ENV !== 'production') {
      console.info('[inquiry] email not configured, payload below\n', text);
      return NextResponse.json({ ok: true, delivered: false });
    }
    console.error('[inquiry] missing RESEND_API_KEY, INQUIRY_TO_EMAIL or INQUIRY_FROM_EMAIL');
    return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        html,
        ...(host.inquiryRouting.replyToGuest ? { reply_to: email } : {}),
      }),
    });

    if (!response.ok) {
      console.error('[inquiry] provider rejected the message', response.status);
      return NextResponse.json({ error: 'send_failed' }, { status: 502 });
    }
  } catch (error) {
    console.error('[inquiry] provider unreachable', error);
    return NextResponse.json({ error: 'send_failed' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, delivered: true });
}

export async function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
