import type { Metadata } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { DocumentLocale } from '@/components/DocumentLocale';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { localeTags, routing, type Locale } from '@/i18n/routing';
import { siteUrl } from '@/lib/content';

/**
 * Everything that depends on the language, and nothing else: the document
 * shell is one level up so that a language change stays a client navigation.
 *
 * The chrome lives here rather than in each page. It is the same header and
 * the same footer on all four pages, so moving from one to another now
 * replaces the <main> alone, and only a language change replaces the chrome.
 */

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

  const common = await getTranslations({ locale, namespace: 'common' });
  const nav = await getTranslations({ locale, namespace: 'nav' });

  return (
    <NextIntlClientProvider>
      <DocumentLocale tag={localeTags[locale as Locale]} />

      <a className="skip-link" href="#main">
        {common('skipToContent')}
      </a>

      <Header
        labels={{
          home: nav('home'),
          gallery: nav('gallery'),
          amenities: nav('amenities'),
          around: nav('around'),
          about: nav('about'),
          reviews: nav('reviews'),
          location: nav('location'),
          book: nav('book'),
          openMenu: nav('openMenu'),
          closeMenu: nav('closeMenu'),
          language: nav('language'),
          primary: nav('primary'),
          mobileMenu: nav('mobileMenu'),
        }}
      />

      {children}

      <Footer year={new Date().getFullYear()} />
    </NextIntlClientProvider>
  );
}
