import type { Metadata } from 'next';
import { getPathname } from '@/i18n/navigation';
import {
  localeTags,
  openGraphLocales,
  routing,
  type AppPathname,
  type Locale,
} from '@/i18n/routing';
import { siteUrl } from '@/lib/content';

/** Absolute, canonical URL for one page in one language. */
export function localizedUrl(pathname: AppPathname, locale: Locale): string {
  const path = getPathname({ href: pathname, locale });
  return `${siteUrl}${path === '/' ? '/' : path}`;
}

/** hreflang map, including x-default pointing at the French version (FR-006). */
export function alternateLanguages(pathname: AppPathname): Record<string, string> {
  const languages: Record<string, string> = {};

  for (const locale of routing.locales) {
    languages[localeTags[locale]] = localizedUrl(pathname, locale);
  }
  languages['x-default'] = localizedUrl(pathname, routing.defaultLocale);

  return languages;
}

type BuildMetadataInput = {
  locale: Locale;
  pathname: AppPathname;
  title: string;
  description: string;
  siteName: string;
  noIndex?: boolean;
};

export function buildMetadata({
  locale,
  pathname,
  title,
  description,
  siteName,
  noIndex = false,
}: BuildMetadataInput): Metadata {
  const url = localizedUrl(pathname, locale);

  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    alternates: {
      canonical: url,
      languages: alternateLanguages(pathname),
    },
    openGraph: {
      type: 'website',
      siteName,
      title,
      description,
      url,
      locale: openGraphLocales[locale],
      alternateLocale: routing.locales
        .filter((item) => item !== locale)
        .map((item) => openGraphLocales[item]),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    robots: noIndex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
        },
  };
}
