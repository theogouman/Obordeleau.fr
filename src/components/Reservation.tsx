import { useLocale, useTranslations } from 'next-intl';
import { AccentHeading } from '@/components/AccentHeading';
import { BookingForm } from '@/components/BookingForm';
import { ChannelLink } from '@/components/ChannelLink';
import { Reveal } from '@/components/Reveal';
import { Section } from '@/components/Section';
import { getPathname } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { channel, host, property } from '@/lib/content';

/**
 * FR-013 to FR-015 and FR-103: one centred column, the calendar and nothing
 * else. The dates chosen here are written and blocked immediately, on the site
 * and, through the master feed, on Airbnb and Booking. No payment is taken yet
 * (Phase 3). The two platforms stay reachable underneath, as a plain line
 * rather than as cards competing with the direct path.
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
          />
        </div>
      </Reveal>

      {airbnb?.url || booking?.url ? (
        <Reveal delay={140}>
          <div className="mx-auto mt-8 max-w-2xl text-center text-sm text-ink-soft">
            <p>{t('channels.alsoOn')}</p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {airbnb?.url ? (
                <ChannelLink
                  channel="airbnb"
                  href={airbnb.url}
                  locale={locale}
                  label={t('channels.airbnb.cta')}
                  externalHint={t('channels.airbnb.external')}
                  className="text-raspberry-ink underline underline-offset-4"
                />
              ) : null}
              {booking?.url ? (
                <ChannelLink
                  channel="booking"
                  href={booking.url}
                  locale={locale}
                  label={t('channels.booking.cta')}
                  externalHint={t('channels.booking.external')}
                  className="text-raspberry-ink underline underline-offset-4"
                />
              ) : null}
            </div>
          </div>
        </Reveal>
      ) : null}
    </Section>
  );
}
