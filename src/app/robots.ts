import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/content';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // The legal notice stays out of the index until its identity fields
        // are filled in, and the inquiry endpoint is never a landing page.
        disallow: ['/api/', '/mentions-legales', '/legal-notice', '/impressum'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
