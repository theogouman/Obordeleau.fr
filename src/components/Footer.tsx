import Image from 'next/image';
import NextLink from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Icon } from '@/components/Icon';
import { getPathname, Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Wordmark } from '@/components/Wordmark';
import { assetExists } from '@/lib/assets';
import { channel, host, property } from '@/lib/content';

export function Footer({ year }: { year: number }) {
  const t = useTranslations('footer');
  const nav = useTranslations('nav');
  const locale = useLocale() as Locale;
  const airbnb = channel('airbnb');
  const booking = channel('booking');

  /*
   * The booking section, wherever the visitor is reading from. Pointing at the
   * home page alone sent them to the top of it, which is a scroll away from
   * the calendar they asked for. The localized home comes from the routing
   * table rather than being written out, so /en and /de keep their own path.
   */
  const bookHref = `${getPathname({ href: '/', locale })}#book`;

  const whatsappHref = `https://wa.me/${host.contact.whatsappNumber}?text=${encodeURIComponent(
    t('whatsappMessage'),
  )}`;
  const mailHref = `mailto:${host.contact.email}?subject=${encodeURIComponent(t('emailSubject'))}`;

  const logo = `/images/area/${host.classificationLogo}`;
  const hasLogo = assetExists(logo);

  return (
    <footer className="bg-night text-cream">
      <div className="container-page grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-4">
        {/* The address is what a footer is asked for, and it was in a column of
            its own saying so twice: once as a heading and once as the words
            under the wordmark. It stands under the mark now, where the eye
            already is, and the column it had goes back to the grid. */}
        <div className="lg:col-span-2">
          <Wordmark className="text-cream" />
          <address className="mt-4 not-italic text-cream/80">
            {property.address.street}
            <br />
            {property.address.postalCode} {property.address.locality}
            <br />
            {property.address.neighbourhood}
          </address>
          {hasLogo ? (
            <Image
              src={logo}
              alt={t('classificationAlt')}
              width={88}
              height={88}
              className="mt-6 h-auto w-[88px] rounded-lg bg-cream/95 p-1.5"
              sizes="88px"
            />
          ) : null}
        </div>

        <div>
          <h2 className="font-display text-lg">{t('contactTitle')}</h2>
          <ul className="mt-3 space-y-2 text-cream/80">
            <li>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 hover:text-sunset"
              >
                <Icon name="whatsapp" className="h-[18px] w-auto shrink-0" />
                {t('whatsapp')}
              </a>
            </li>
            <li>
              <a href={mailHref} className="inline-flex items-center gap-2 hover:text-sunset">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    d="M3 6h18v12H3zM3 7l9 6 9-6"
                  />
                </svg>
                {t('email')}
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-display text-lg">{t('bookTitle')}</h2>
          <ul className="mt-3 space-y-2 text-cream/80">
            <li>
              <NextLink href={bookHref} className="hover:text-sunset">
                {t('bookDirect')}
              </NextLink>
            </li>
            {airbnb?.url ? (
              <li>
                <a
                  href={airbnb.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-sunset"
                >
                  Airbnb
                </a>
              </li>
            ) : null}
            {booking?.url ? (
              <li>
                <a
                  href={booking.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-sunset"
                >
                  Booking
                </a>
              </li>
            ) : null}
          </ul>

          <h2 className="mt-6 font-display text-lg">{t('aboutTitle')}</h2>
          <ul className="mt-3 space-y-2 text-cream/80">
            <li>
              <Link href="/reviews" className="hover:text-sunset">
                {t('reviews')}
              </Link>
            </li>
            <li>
              <Link href="/legal-notice" className="hover:text-sunset">
                {t('legalNotice')}
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="hover:text-sunset">
                {t('privacy')}
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-cream/15">
        <div className="container-page flex flex-col gap-4 py-6 text-sm text-cream/70 md:flex-row md:items-center md:justify-between">
          <p>{t('copyright', { year })}</p>
          <LanguageSwitcher label={nav('language')} tone="dark" />
        </div>
      </div>
    </footer>
  );
}
