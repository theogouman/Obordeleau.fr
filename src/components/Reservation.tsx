import { useLocale, useTranslations } from 'next-intl';
import { AccentHeading } from '@/components/AccentHeading';
import { BookingForm } from '@/components/BookingForm';
import { Reveal } from '@/components/Reveal';
import { Section } from '@/components/Section';
import { getPathname } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { channel, host, property } from '@/lib/content';

/**
 * FR-013 to FR-015 and FR-103: one centred column, the calendar and nothing
 * else. The dates chosen here are written and blocked immediately, on the site
 * and, through the master feed, on Airbnb and Booking. No payment is taken yet
 * (Phase 3). The two platforms stay reachable, inside the card and under its
 * own call to action, behind a word about what they add to the bill.
 */
export function Reservation() {
  const t = useTranslations('reservation');
  const locale = useLocale() as Locale;
  const privacyHref = getPathname({ href: '/privacy', locale });

  const airbnb = channel('airbnb');
  const booking = channel('booking');

  return (
    <Section id="book" muted labelledBy="book-title">
      <Reveal className="mx-auto max-w-2xl text-center">
        <AccentHeading
          id="book-title"
          lead={t('titleLead')}
          accent={t('titleAccent')}
          tail={t('titleTail')}
        />
      </Reveal>

      <Reveal delay={80}>
        <div id="booking-form" className="mx-auto mt-10 w-full max-w-2xl scroll-mt-24">
          <BookingForm
            maxGuests={property.capacity.maxGuests}
            privacyHref={privacyHref}
            whatsappNumber={host.contact.whatsappNumber}
            airbnbUrl={airbnb?.url ?? undefined}
            bookingUrl={booking?.url ?? undefined}
          />
        </div>
      </Reveal>
    </Section>
  );
}
