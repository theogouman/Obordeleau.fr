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

/**
 * Absolute, canonical URL for one page in one language.
 *
 * The root is emitted without a trailing slash, because that is the form Next
 * normalizes `alternates.canonical` to. Writing it with a slash here made the
 * sitemap advertise `https://www.obordeleau.fr/` while the page itself declared
 * `https://www.obordeleau.fr` as canonical: two strings for one page, which a
 * strict crawler is entitled to read as two URLs.
 */
export function localizedUrl(pathname: AppPathname, locale: Locale): string {
  const path = getPathname({ href: pathname, locale });
  return `${siteUrl}${path === '/' ? '' : path}`;
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
    /*
     * Absolute, so the layout's `%s | siteName` template does not apply.
     *
     * Every title in messages/ already carries the site name where it belongs,
     * and the template was appending a second one: pages came out as
     * "Mentions legales | Obordeleau | Obordeleau". The home page escaped it,
     * because a template does not apply to the page of its own segment, which
     * is why it went unnoticed. Owning the whole string here removes the
     * question of which page is a child of what.
     */
    title: { absolute: title },
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
