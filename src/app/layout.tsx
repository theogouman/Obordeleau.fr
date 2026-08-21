import type { Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { ReactNode } from 'react';
import { localeTags, routing } from '@/i18n/routing';
import '@/styles/globals.css';

/**
 * The document shell, and it sits above the [locale] segment on purpose.
 *
 * Next treats a root layout under a dynamic segment as a different root layout
 * for every value of that segment, and navigating between two root layouts is
 * a full document load, not a client navigation. With <html> down in
 * [locale]/layout.tsx, changing the language reloaded the whole page: white
 * flash, every script parsed again, all React state lost. Up here the shell is
 * rendered once and a language change is an ordinary client navigation.
 *
 * The price is <html lang>, which this file cannot know: reading it from the
 * request headers would opt the whole tree into dynamic rendering. So the
 * document ships with the default language, the inline script below corrects
 * the attribute from the URL before the first paint, and DocumentLocale keeps
 * it in step on every later switch. The hreflang alternates in the metadata
 * are unaffected and stay authoritative for crawlers.
 */

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

/** Only the prefixed locales need a correction: the default one is the shell. */
const PREFIXED_TAGS = JSON.stringify(
  Object.fromEntries(
    routing.locales
      .filter((locale) => locale !== routing.defaultLocale)
      .map((locale) => [locale, localeTags[locale]]),
  ),
);

const LANG_SCRIPT =
  `(function(){var s=location.pathname.split('/')[1],t=${PREFIXED_TAGS};` +
  'if(t[s])document.documentElement.lang=t[s];})();';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang={localeTags[routing.defaultLocale]}
      dir="ltr"
      className={`${display.variable} ${body.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-cream text-ink antialiased">
        <script dangerouslySetInnerHTML={{ __html: LANG_SCRIPT }} />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
