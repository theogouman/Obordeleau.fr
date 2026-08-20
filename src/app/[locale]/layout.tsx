import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { ReactNode } from 'react';
import { Footer } from '@/components/Footer';
import { localeTags, routing, type Locale } from '@/i18n/routing';
import { siteUrl } from '@/lib/content';
import '@/styles/globals.css';

const display = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-fraunces',
});

const body = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const viewport: Viewport = {
  themeColor: '#faf7f2',
  colorScheme: 'light',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });

  return {
    metadataBase: new URL(siteUrl),
    applicationName: t('siteName'),
    title: {
      default: t('home.title'),
      template: `%s | ${t('siteName')}`,
    },
    description: t('home.description'),
    formatDetection: { telephone: false, address: false, email: false },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'common' });

  return (
    <html lang={localeTags[locale as Locale]} dir="ltr" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-dvh bg-cream text-ink antialiased">
        <NextIntlClientProvider>
          <a className="skip-link" href="#main">
            {t('skipToContent')}
          </a>
          {children}
          <Footer year={new Date().getFullYear()} />
        </NextIntlClientProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
