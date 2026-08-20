import { useLocale, useTranslations } from 'next-intl';
import { AccentHeading } from '@/components/AccentHeading';
import { ChannelLink } from '@/components/ChannelLink';
import { InquiryForm } from '@/components/InquiryForm';
import { Reveal } from '@/components/Reveal';
import { Section } from '@/components/Section';
import { getPathname } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { channel, property } from '@/lib/content';

/**
 * FR-013 to FR-015: Direct is visually first and carries the form; Airbnb and
 * Booking are offered as peers but secondary. No payment in Phase 1.
 */
export function Reservation() {
  const t = useTranslations('reservation');
  const common = useTranslations('common');
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
        <p className="mt-4 text-lg text-ink-soft">{t('intro')}</p>
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
              <a href="#inquiry-form" className="btn btn-primary mt-4">
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
          <div id="inquiry-form" className="scroll-mt-24">
            <InquiryForm
              locale={locale}
              maxGuests={property.capacity.maxGuests}
              privacyHref={privacyHref}
              labels={{
                title: t('form.title'),
                intro: t('form.intro'),
                arrival: t('form.arrival'),
                departure: t('form.departure'),
                guests: t('form.guests'),
                name: t('form.name'),
                email: t('form.email'),
                phone: t('form.phone'),
                message: t('form.message'),
                messagePlaceholder: t('form.messagePlaceholder'),
                consent: t('form.consent'),
                consentLink: t('form.consentLink'),
                submit: t('form.submit'),
                submitting: t('form.submitting'),
                successTitle: t('form.successTitle'),
                successBody: t('form.successBody'),
                successAgain: t('form.successAgain'),
                optional: common('optional'),
                honeypotLabel: t('form.honeypotLabel'),
                errors: {
                  required: t('form.errors.required'),
                  email: t('form.errors.email'),
                  dateOrder: t('form.errors.dateOrder'),
                  datePast: t('form.errors.datePast'),
                  guests: t('form.errors.guests'),
                  consent: t('form.errors.consent'),
                  rateLimited: t('form.errors.rateLimited'),
                  server: t('form.errors.server'),
                },
              }}
            />
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
