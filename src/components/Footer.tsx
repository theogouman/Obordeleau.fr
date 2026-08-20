import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Wordmark } from '@/components/Wordmark';
import { assetExists } from '@/lib/assets';
import { channel, host, property } from '@/lib/content';

export function Footer({ year }: { year: number }) {
  const t = useTranslations('footer');
  const nav = useTranslations('nav');
  const airbnb = channel('airbnb');
  const booking = channel('booking');

  const whatsappHref = `https://wa.me/${host.contact.whatsappNumber}?text=${encodeURIComponent(
    t('whatsappMessage'),
  )}`;
  const mailHref = `mailto:${host.contact.email}?subject=${encodeURIComponent(t('emailSubject'))}`;

  const logo = `/images/area/${host.classificationLogo}`;
  const hasLogo = assetExists(logo);

  return (
    <footer className="bg-night text-cream">
      <div className="container-page grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <Wordmark className="text-cream" />
          <p className="mt-4 max-w-sm text-cream/80">{t('tagline')}</p>
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
          <h2 className="font-display text-lg">{t('addressTitle')}</h2>
          <address className="mt-3 not-italic text-cream/80">
            {property.address.street}
            <br />
            {property.address.postalCode} {property.address.locality}
            <br />
            {property.address.neighbourhood}
          </address>
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
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                  <path
                    fill="currentColor"
                    d="M12 2a10 10 0 0 0-8.7 15L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.2 14.8l-.3-.2-2.6.7.7-2.5-.2-.3A8 8 0 0 1 12 4zm-3.3 4c-.2 0-.5.1-.7.4-.2.3-.8.8-.8 1.9s.8 2.2.9 2.3c.1.2 1.6 2.6 4 3.5 1.9.8 2.3.6 2.7.6.4 0 1.3-.5 1.5-1.1.2-.6.2-1 .1-1.1l-.6-.3-1.4-.7c-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1-.2-.1-.9-.4-1.8-1.1-.7-.6-1.1-1.3-1.2-1.5-.1-.2 0-.4.1-.5l.4-.5.2-.4v-.4L9.4 8.4c-.2-.4-.4-.4-.5-.4z"
                  />
                </svg>
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
