import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/content';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // The legal notice stays out of the index until its identity fields
        // are filled in, the inquiry endpoint is never a landing page, and
        // the owner's console is not a page at all as far as a crawler is
        // concerned. The console also sends its own noindex, since a
        // robots rule is a request and a header is not.
        disallow: [
          '/api/',
          '/admin',
          '/mentions-legales',
          '/legal-notice',
          '/impressum',
          // The balance confirmation is one guest's business, not a landing
          // page. It sends its own noindex as well, since a robots rule is a
          // request and a meta tag is an instruction.
          '/solde',
          '/balance',
          '/restbetrag',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
