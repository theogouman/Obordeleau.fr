import { track } from '@vercel/analytics';

/**
 * SC-005: the Direct versus channel share must be measurable. Events carry no
 * personal data, which keeps the cookieless setup consent free (FR-021).
 */

export type BookingChannel = 'direct' | 'airbnb' | 'booking';

export function trackBookingIntent(channel: BookingChannel, locale: string) {
  track('booking_intent', { channel, locale });
}

/** FR-103: a direct booking the server accepted and wrote. */
export function trackBookingConfirmed(locale: string) {
  track('booking_confirmed', { locale });
}
