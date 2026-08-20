import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Wordmark } from '@/components/Wordmark';
import { channel, externalMapUrl, formattedAddress, property } from '@/lib/content';

export function Footer({ year }: { year: number }) {
  const t = useTranslations('footer');
  const nav = useTranslations('nav');
  const airbnb = channel('airbnb');
  const booking = channel('booking');

  return (
    <footer className="bg-night text-cream">
      <div className="container-page grid gap-10 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <Wordmark className="text-cream" />
          <p className="mt-4 max-w-sm text-cream/80">{t('tagline')}</p>
        </div>

        <div>
          <h2 className="font-display text-lg">{t('addressTitle')}</h2>
          <address className="mt-3 not-italic text-cream/80">
            {property.address.street}
            <br />
            {property.address.postalCode} {property.address.locality}
            <br />
            {property.address.neighbourhood}
          </address>
          <a
            className="mt-3 inline-block text-cream underline underline-offset-4 hover:text-sunset"
            href={externalMapUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {formattedAddress}
          </a>
        </div>

        <div>
          <h2 className="font-display text-lg">{t('bookTitle')}</h2>
          <ul className="mt-3 space-y-2 text-cream/80">
            <li>
              <Link href="/" className="hover:text-sunset">
                {nav('book')}
              </Link>
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
          <p>{t('madeNote')}</p>
          <LanguageSwitcher label={nav('language')} tone="dark" />
        </div>
      </div>
    </footer>
  );
}
