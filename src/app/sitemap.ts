import type { MetadataRoute } from 'next';
import { routing, type AppPathname } from '@/i18n/routing';
import { alternateLanguages, localizedUrl } from '@/lib/seo';

/** FR-022: one entry per page and per language, with hreflang alternates. */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: Array<{ pathname: AppPathname; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }> = [
    { pathname: '/', priority: 1, changeFrequency: 'weekly' },
    { pathname: '/reviews', priority: 0.7, changeFrequency: 'monthly' },
    { pathname: '/privacy', priority: 0.2, changeFrequency: 'yearly' },
  ];

  const lastModified = new Date();

  return pages.flatMap((page) =>
    routing.locales.map((locale) => ({
      url: localizedUrl(page.pathname, locale),
      lastModified,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
      alternates: { languages: alternateLanguages(page.pathname) },
    })),
  );
}
