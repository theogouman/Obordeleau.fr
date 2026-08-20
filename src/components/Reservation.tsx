import { useLocale, useTranslations } from 'next-intl';
import { AccentHeading } from '@/components/AccentHeading';
import { BookingForm } from '@/components/BookingForm';
import { ChannelLink } from '@/components/ChannelLink';
import { Reveal } from '@/components/Reveal';
import { Section } from '@/components/Section';
import { getPathname } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { channel, property } from '@/lib/content';

/**
 * FR-013 to FR-015 and FR-103: Direct is visually first and carries the booking
 * calendar; Airbnb and Booking are offered as peers but secondary. The dates
 * chosen here are written and blocked immediately, on the site and, through the
 * master feed, on both platforms. No payment is taken yet (Phase 3).
 */
export function Reservation() {
  const t = useTranslations('reservation');
  const locale = useLocale() as Locale;
  const privacyHref = getPathname({ href: '/privacy', locale });

  const airbnb = channel('airbnb');
  const booking = channel('booking');

  return (
    <Section id="book" muted labelledBy="book-title">
      <Reveal className="max-w-2xl">
        <AccentHeading
          id="book-title"
          lead={t('titleLead')}
          accent={t('titleAccent')}
          tail={t('titleTail')}
        />
      </Reveal>

      <div className="mt-10 grid items-start gap-8 lg:grid-cols-[1fr_1fr]">
        <Reveal>
          <div className="space-y-4">
            <div className="card border-2 border-raspberry p-6">
              <p className="inline-flex rounded-[var(--radius-pill)] bg-raspberry px-3 py-1 text-sm font-semibold text-white">
                {t('channels.direct.badge')}
              </p>
              <h3 className="mt-3 font-display text-2xl">{t('channels.direct.title')}</h3>
              <p className="mt-2 text-ink-soft">{t('channels.direct.body')}</p>
              <a href="#booking-form" className="btn btn-primary mt-4">
                {t('channels.direct.cta')}
              </a>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {airbnb?.url ? (
                <div className="card card-tilt p-5">
                  <h3 className="font-display text-xl">{t('channels.airbnb.title')}</h3>
                  <p className="mt-2 text-sm text-ink-soft">{t('channels.airbnb.body')}</p>
                  <ChannelLink
                    channel="airbnb"
                    href={airbnb.url}
                    locale={locale}
                    label={t('channels.airbnb.cta')}
                    externalHint={t('channels.airbnb.external')}
                    className="btn btn-secondary mt-4 w-full px-4 py-2 text-sm"
                  />
                </div>
              ) : null}

              {booking?.url ? (
                <div className="card card-tilt p-5">
                  <h3 className="font-display text-xl">{t('channels.booking.title')}</h3>
                  <p className="mt-2 text-sm text-ink-soft">{t('channels.booking.body')}</p>
                  <ChannelLink
                    channel="booking"
                    href={booking.url}
                    locale={locale}
                    label={t('channels.booking.cta')}
                    externalHint={t('channels.booking.external')}
                    className="btn btn-secondary mt-4 w-full px-4 py-2 text-sm"
                  />
                </div>
              ) : null}
            </div>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div id="booking-form" className="scroll-mt-24">
            <BookingForm maxGuests={property.capacity.maxGuests} privacyHref={privacyHref} />
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
