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
 * else.
 *
 * A stay is confirmed by its deposit and by nothing else. The card holds the
 * nights while the deposit is taken, and only a cleared payment turns that hold
 * into a booking that blocks the dates here and, through the master feed, on
 * Airbnb and Booking. When no deposit can be taken, because the owner has not
 * priced the nights or the payment keys are missing from the build, the card
 * writes nothing at all and hands the visitor the host instead.
 *
 * The two platforms stay reachable, inside the card and under its own call to
 * action, behind a word about what they add to the bill.
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

      {/*
       * Without JavaScript the card below is a calendar that cannot be paged
       * and a button that cannot be pressed, so it is taken out of the page and
       * this stands in its place: why, and three ways to reach the host that
       * need no script at all.
       *
       * It sits here rather than inside BookingForm because this component is
       * rendered on the server and never hydrates. React reconciling noscript
       * children on the client is a known way to produce a mismatch, and the
       * style tag only exists for a visitor who will never run the script that
       * would trip over it.
       */}
      <noscript>
        <style>{'.booking-card{display:none}'}</style>
        <div className="card mx-auto mt-10 w-full max-w-2xl px-6 py-8 sm:px-8 sm:py-10">
          <h3 className="font-display text-xl">{t('booking.noscript.title')}</h3>
          <p className="mt-3 text-sm text-ink-soft">{t('booking.noscript.body')}</p>
          <ul className="mt-5 space-y-2 text-sm">
            <li>
              <a
                className="text-raspberry-ink underline underline-offset-4"
                href={`https://wa.me/${host.contact.whatsappNumber}`}
              >
                {t('booking.noscript.whatsapp')}
              </a>
            </li>
            {airbnb?.url ? (
              <li>
                <a
                  className="text-raspberry-ink underline underline-offset-4"
                  href={airbnb.url}
                  rel="noopener"
                >
                  {t('booking.noscript.airbnb')}
                </a>
              </li>
            ) : null}
            {booking?.url ? (
              <li>
                <a
                  className="text-raspberry-ink underline underline-offset-4"
                  href={booking.url}
                  rel="noopener"
                >
                  {t('booking.noscript.booking')}
                </a>
              </li>
            ) : null}
          </ul>
        </div>
      </noscript>

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
