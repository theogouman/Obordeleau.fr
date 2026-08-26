import type { MetadataRoute } from 'next';
import { routing, type AppPathname } from '@/i18n/routing';
import { gallerySequence, siteUrl } from '@/lib/content';
import { alternateLanguages, localizedUrl } from '@/lib/seo';

/**
 * The photographs of the flat, declared once on the home page.
 *
 * A holiday rental is chosen with the eyes, and sixteen rooms shot in daylight
 * were reachable by a crawler only through the lightbox that loads them. An
 * image sitemap is the one place to say they exist and which page they belong
 * to. They ride on the home entry alone rather than on all four languages: it
 * is the same sixteen files whatever the language, and repeating them per
 * locale would advertise the same image four times over.
 */
const galleryImages = gallerySequence.map((photo) => `${siteUrl}/images/gallery/${photo.file}`);

/** FR-022: one entry per page and per language, with hreflang alternates. */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: Array<{ pathname: AppPathname; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }> = [
    { pathname: '/', priority: 1, changeFrequency: 'weekly' },
    { pathname: '/reviews', priority: 0.7, changeFrequency: 'monthly' },
    // The guides: they answer what a visitor searches for before they have
    // chosen a flat, so they matter more here than the privacy page.
    { pathname: '/what-to-do', priority: 0.6, changeFrequency: 'monthly' },
    { pathname: '/boat-to-toulon', priority: 0.6, changeFrequency: 'monthly' },
    { pathname: '/car-free', priority: 0.6, changeFrequency: 'monthly' },
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
      ...(page.pathname === '/' && locale === routing.defaultLocale
        ? { images: galleryImages }
        : {}),
    })),
  );
}
