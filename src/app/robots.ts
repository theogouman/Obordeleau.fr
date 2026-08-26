import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/content';

/**
 * Two surfaces are closed to crawlers, and neither is a page.
 *
 * The legal notice and the balance confirmation used to be listed here as
 * well, each in its three translated forms. That was wrong twice over. It was
 * incomplete, because the Italian segments (/note-legali, /saldo) were never
 * added and nobody noticed; and it was self defeating, because both pages
 * already send `noindex`, and a crawler that obeys the Disallow never
 * downloads the page, so it never reads the instruction not to index it.
 * Google is then free to list the URL with no description, which is precisely
 * what the block was meant to prevent.
 *
 * A noindex is an instruction and a robots rule is a request, so the pages
 * that have to disappear from the index keep the instruction and lose the
 * request. What stays below is what is not a page at all: the inquiry
 * endpoints, and the owner's console, which no robot has any business
 * fetching even once. The console sends its own noindex too.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
