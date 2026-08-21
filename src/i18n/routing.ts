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

/**
 * The flag shown in the language switcher. Systems without a flag font draw a
 * regional indicator pair as two letter boxes, so the switcher checks at
 * runtime and falls back to the language code when they are not painted.
 */
export const localeFlags: Record<Locale, string> = {
  fr: '\u{1F1EB}\u{1F1F7}',
  en: '\u{1F1EC}\u{1F1E7}',
  de: '\u{1F1E9}\u{1F1EA}',
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
