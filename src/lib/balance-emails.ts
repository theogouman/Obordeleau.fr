import { getTranslations } from 'next-intl/server';
import { localeTags, routing, type Locale } from '@/i18n/routing';
import type { DueBalance, SettledBalance } from '@/lib/balances';
import { formattedAddress, host, property, siteUrl } from '@/lib/content';
import { nightsBetween } from '@/lib/dates';
import { formatEmailDate, hostInbox, renderEmail, sendEmail, type Detail } from '@/lib/email';

/**
 * The letters the balance sends.
 *
 * Three of them, and which one goes out is decided by what the card did:
 * a receipt when it cleared, a link when the guest has to be present, and an
 * alert to Corine when neither of those is going to happen on its own.
 *
 * The guest reads their own language. Corine reads French, whatever the guest
 * chose, because she is the one who has to act on it.
 */

/** Why the guest is being asked to pay rather than simply being charged. */
export type LinkReason = 'authentication' | 'noCard' | 'failed';

function asLocale(value: string | null): Locale {
  return (routing.locales as readonly string[]).includes(value ?? '')
    ? (value as Locale)
    : routing.defaultLocale;
}

function money(amount: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(localeTags[locale], {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function bookingReference(reservationId: string): string {
  return reservationId.slice(0, 8).toUpperCase();
}

/** Where a guest goes to finish paying. Our URL, so it outlives any Stripe session. */
export function balancePayUrl(token: string): string {
  return `${siteUrl}/api/balances/pay/${token}`;
}

/** The balance cleared on its own. Nothing to do, so the letter says so. */
export async function sendBalanceReceipt(booking: SettledBalance): Promise<boolean> {
  const locale = asLocale(booking.locale);
  const labels = await getTranslations({ locale, namespace: 'emails.balance.labels' });
  const copy = await getTranslations({ locale, namespace: 'emails.balance.receipt' });
  const inbox = hostInbox();

  const details: Detail[] = [
    { label: labels('arrival'), value: formatEmailDate(booking.startDate, locale) },
    { label: labels('departure'), value: formatEmailDate(booking.endDate, locale) },
    { label: labels('nights'), value: String(nightsBetween(booking.startDate, booking.endDate)) },
    { label: labels('amount'), value: money(booking.balanceDue, booking.currency, locale) },
    { label: labels('reference'), value: bookingReference(booking.reservationId) },
  ];

  const email = renderEmail(copy('title'), copy('intro', { name: booking.guestName }), details, [
    copy('settled'),
    copy('address', { address: `${property.name}, ${formattedAddress}` }),
    copy('signature', { host: host.firstName }),
  ]);

  return sendEmail(
    {
      to: [booking.guestEmail],
      subject: copy('subject', { property: property.name }),
      ...(inbox ? { reply_to: inbox } : {}),
      ...email,
    },
    'balance',
  );
}

/**
 * The card could not be charged on its own, so the guest is given a link.
 *
 * The opening sentence differs by reason, because "your bank wants to see you"
 * and "your card was refused" are not the same news and should not read as if
 * they were.
 */
export async function sendBalanceLinkEmail(input: {
  balance: DueBalance;
  url: string;
  reason: LinkReason;
  isReminder: boolean;
}): Promise<boolean> {
  const { balance, url, reason, isReminder } = input;
  const locale = asLocale(balance.locale);
  const labels = await getTranslations({ locale, namespace: 'emails.balance.labels' });
  const copy = await getTranslations({ locale, namespace: 'emails.balance.link' });
  const inbox = hostInbox();

  const intro = {
    authentication: copy('introAuthentication', { name: balance.guestName }),
    noCard: copy('introNoCard', { name: balance.guestName }),
    failed: copy('introFailed', { name: balance.guestName }),
  }[reason];

  const details: Detail[] = [
    { label: labels('arrival'), value: formatEmailDate(balance.startDate, locale) },
    { label: labels('departure'), value: formatEmailDate(balance.endDate, locale) },
    { label: labels('amount'), value: money(balance.balanceDue, balance.currency, locale) },
    { label: labels('reference'), value: bookingReference(balance.reservationId) },
  ];

  const email = renderEmail(
    isReminder ? copy('titleReminder') : copy('title'),
    isReminder ? `${copy('reminder')} ${intro}` : intro,
    details,
    [copy('secure'), copy('changes'), copy('signature', { host: host.firstName })],
    { label: copy('action', { amount: money(balance.balanceDue, balance.currency, locale) }), url },
  );

  return sendEmail(
    {
      to: [balance.guestEmail],
      subject: isReminder
        ? copy('subjectReminder', { property: property.name })
        : copy('subject', { property: property.name }),
      ...(inbox ? { reply_to: inbox } : {}),
      ...email,
    },
    'balance',
  );
}

/**
 * Corine, in French. Sent when a card is refused and again when the guest has
 * stopped answering, because at that point it is a telephone call and not a
 * cron job.
 */
export async function sendBalanceHostAlert(input: {
  balance: DueBalance;
  kind: 'failed' | 'escalation';
  detail: string;
  url: string | null;
}): Promise<boolean> {
  const inbox = hostInbox();
  if (!inbox) {
    console.error('[balance] no BOOKINGS_TO_EMAIL or INQUIRY_TO_EMAIL, host not alerted');
    return false;
  }

  const locale = routing.defaultLocale;
  const labels = await getTranslations({ locale, namespace: 'emails.balance.labels' });
  const copy = await getTranslations({ locale, namespace: 'emails.balance.host' });

  const details: Detail[] = [
    { label: labels('arrival'), value: formatEmailDate(input.balance.startDate, locale) },
    { label: labels('departure'), value: formatEmailDate(input.balance.endDate, locale) },
    { label: labels('guest'), value: input.balance.guestName },
    { label: labels('email'), value: input.balance.guestEmail },
    {
      label: labels('amount'),
      value: money(input.balance.balanceDue, input.balance.currency, locale),
    },
    { label: labels('attempts'), value: String(input.balance.attempts + 1) },
    { label: labels('reference'), value: bookingReference(input.balance.reservationId) },
  ];

  const email = renderEmail(
    input.kind === 'failed' ? copy('titleFailed') : copy('titleEscalation'),
    input.kind === 'failed' ? copy('introFailed') : copy('introEscalation'),
    details,
    [copy('detail', { detail: input.detail }), copy('console')],
    input.url ? { label: copy('action'), url: input.url } : undefined,
  );

  return sendEmail(
    {
      to: [inbox],
      subject:
        input.kind === 'failed'
          ? copy('subjectFailed', { from: input.balance.startDate, to: input.balance.endDate })
          : copy('subjectEscalation', { from: input.balance.startDate, to: input.balance.endDate }),
      reply_to: input.balance.guestEmail,
      ...email,
    },
    'balance',
  );
}
