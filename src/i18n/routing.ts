import { defineRouting } from 'next-intl/routing';

/**
 * Constitution III: French is the default and stays unprefixed; English and
 * German are full peers with their own localized URL segments.
 */
export const routing = defineRouting({
  locales: ['fr', 'en', 'de'],
  defaultLocale: 'fr',
  localePrefix: 'as-needed',
  localeDetection: false,
  pathnames: {
    '/': '/',
    '/reviews': {
      fr: '/avis',
      en: '/reviews',
      de: '/bewertungen',
    },
    '/legal-notice': {
      fr: '/mentions-legales',
      en: '/legal-notice',
      de: '/impressum',
    },
    '/privacy': {
      fr: '/confidentialite',
      en: '/privacy',
      de: '/datenschutz',
    },
  },
});

export type Locale = (typeof routing.locales)[number];
export type AppPathname = keyof typeof routing.pathnames;

export const localeNames: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  de: 'Deutsch',
};

/** BCP 47 tags used for <html lang>, hreflang and Intl formatting. */
export const localeTags: Record<Locale, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  de: 'de-DE',
};

/** Open Graph locale identifiers. */
export const openGraphLocales: Record<Locale, string> = {
  fr: 'fr_FR',
  en: 'en_GB',
  de: 'de_DE',
};
