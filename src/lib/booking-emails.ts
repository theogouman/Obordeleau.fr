import { getTranslations } from 'next-intl/server';
import { localeTags, routing, type Locale } from '@/i18n/routing';
import { formattedAddress, host, property } from '@/lib/content';
import { nightsBetween } from '@/lib/dates';
import { formatEmailDate, hostInbox, renderEmail, sendEmail, type Detail } from '@/lib/email';
import type { ConfirmedBooking } from '@/lib/payments';

/**
 * The letters that go out when a deposit has been taken.
 *
 * Called by whichever of the two paths converted the hold, the webhook or the
 * browser coming back from the card form. The database hands `converted: true`
 * to exactly one of them, so this runs once per booking however many times
 * Stripe replays the event.
 *
 * The guest reads their own language; Corine reads French whatever the guest
 * chose.
 */

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

export async function sendDepositEmails(
  booking: ConfirmedBooking,
): Promise<{ host: boolean; guest: boolean }> {
  const locale = asLocale(booking.locale);
  const nights = nightsBetween(booking.startDate, booking.endDate);
  const code = bookingReference(booking.reservationId);
  const inbox = hostInbox();

  const labels = await getTranslations({ locale, namespace: 'emails.deposit.labels' });
  const guestCopy = await getTranslations({ locale, namespace: 'emails.deposit.guest' });
  const hostLabels = await getTranslations({
    locale: routing.defaultLocale,
    namespace: 'emails.deposit.labels',
  });
  const hostCopy = await getTranslations({
    locale: routing.defaultLocale,
    namespace: 'emails.deposit.host',
  });

  const deposit = money(booking.depositAmount, booking.currency, locale);
  const balance = money(booking.balanceDue, booking.currency, locale);
  const chargeDate = booking.balanceChargeOn ? formatEmailDate(booking.balanceChargeOn, locale) : '';

  // The balance is only announced as automatic when the guest actually agreed
  // to it and a date exists to charge it on. Otherwise it is arranged.
  const automatic = booking.saveCardConsent && booking.balanceChargeOn !== null;

  const guestDetails: Detail[] = [
    { label: labels('arrival'), value: formatEmailDate(booking.startDate, locale) },
    { label: labels('departure'), value: formatEmailDate(booking.endDate, locale) },
    { label: labels('nights'), value: String(nights) },
    { label: labels('guests'), value: String(booking.partySize ?? booking.adults + booking.minors) },
    { label: labels('depositPaid'), value: deposit },
    { label: labels('balance'), value: balance },
    ...(automatic ? [{ label: labels('balanceDate'), value: chargeDate }] : []),
    { label: labels('reference'), value: code },
  ];

  const guestEmail = renderEmail(guestCopy('title'), guestCopy('intro', { name: booking.guestName }), guestDetails, [
    guestCopy('address', { address: `${property.name}, ${formattedAddress}` }),
    automatic
      ? guestCopy('balanceAuto', { amount: balance, date: chargeDate })
      : guestCopy('balanceManual', { amount: balance }),
    guestCopy('changes'),
    guestCopy('signature', { host: host.firstName }),
  ]);

  const hostDetails: Detail[] = [
    { label: hostLabels('arrival'), value: formatEmailDate(booking.startDate, routing.defaultLocale) },
    { label: hostLabels('departure'), value: formatEmailDate(booking.endDate, routing.defaultLocale) },
    { label: hostLabels('nights'), value: String(nights) },
    {
      label: hostLabels('guests'),
      // The split matters: the tourist tax is charged per adult.
      value:
        booking.minors > 0
          ? `${booking.adults + booking.minors} (${booking.adults} + ${booking.minors} < 18)`
          : String(booking.adults),
    },
    { label: hostLabels('name'), value: booking.guestName },
    { label: hostLabels('email'), value: booking.guestEmail },
    {
      label: hostLabels('depositPaid'),
      value: money(booking.depositAmount, booking.currency, routing.defaultLocale),
    },
    {
      label: hostLabels('balance'),
      value: money(booking.balanceDue, booking.currency, routing.defaultLocale),
    },
    {
      label: hostLabels('balanceDate'),
      value: automatic
        ? formatEmailDate(booking.balanceChargeOn as string, routing.defaultLocale)
        : hostCopy('balanceManual'),
    },
    { label: hostLabels('reference'), value: code },
  ];

  const hostEmail = renderEmail(hostCopy('title'), hostCopy('intro'), hostDetails, [
    hostCopy('blocked'),
  ]);

  const [hostDelivered, guestDelivered] = await Promise.all([
    inbox
      ? sendEmail(
          {
            to: [inbox],
            subject: hostCopy('subject', { from: booking.startDate, to: booking.endDate }),
            reply_to: booking.guestEmail,
            ...hostEmail,
          },
          'deposit',
        )
      : Promise.resolve(false),
    sendEmail(
      {
        to: [booking.guestEmail],
        subject: guestCopy('subject', { property: property.name }),
        ...(inbox ? { reply_to: inbox } : {}),
        ...guestEmail,
      },
      'deposit',
    ),
  ]);

  if (!inbox) {
    console.error('[deposit] no BOOKINGS_TO_EMAIL or INQUIRY_TO_EMAIL, host not notified');
  }

  return { host: hostDelivered, guest: guestDelivered };
}

/**
 * The one that should never have to be sent: a deposit cleared for a week that
 * had already gone. The money has been sent back by then; this tells Corine so
 * she can write to the guest herself.
 */
export async function sendRefundAlert(booking: ConfirmedBooking, reason: string): Promise<boolean> {
  const inbox = hostInbox();
  if (!inbox) return false;

  const copy = await getTranslations({
    locale: routing.defaultLocale,
    namespace: 'emails.deposit.refunded',
  });
  const labels = await getTranslations({
    locale: routing.defaultLocale,
    namespace: 'emails.deposit.labels',
  });

  const details: Detail[] = [
    { label: labels('arrival'), value: formatEmailDate(booking.startDate, routing.defaultLocale) },
    { label: labels('departure'), value: formatEmailDate(booking.endDate, routing.defaultLocale) },
    { label: labels('name'), value: booking.guestName },
    { label: labels('email'), value: booking.guestEmail },
    {
      label: labels('depositPaid'),
      value: money(booking.depositAmount, booking.currency, routing.defaultLocale),
    },
    { label: labels('reference'), value: bookingReference(booking.reservationId) },
  ];

  const email = renderEmail(copy('title'), copy('intro'), details, [copy('done'), reason]);

  return sendEmail(
    {
      to: [inbox],
      subject: copy('subject', { from: booking.startDate, to: booking.endDate }),
      ...email,
    },
    'deposit',
  );
}
