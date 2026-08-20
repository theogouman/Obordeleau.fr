import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { About } from '@/components/About';
import { Amenities } from '@/components/Amenities';
import { Around } from '@/components/Around';
import { Gallery } from '@/components/Gallery';
import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { JsonLd } from '@/components/JsonLd';
import { MapSection } from '@/components/MapSection';
import { QuickFacts } from '@/components/QuickFacts';
import { Reservation } from '@/components/Reservation';
import { ReviewsSection } from '@/components/ReviewsSection';
import type { Locale } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo';
import { lodgingJsonLd, websiteJsonLd } from '@/lib/structured-data';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });

  return buildMetadata({
    locale,
    pathname: '/',
    title: t('home.title'),
    description: t('home.description'),
    siteName: t('siteName'),
  });
}

export default async function HomePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const meta = await getTranslations({ locale, namespace: 'meta' });
  const nav = await getTranslations({ locale, namespace: 'nav' });
  const amenities = await getTranslations({ locale, namespace: 'amenities' });

  const lodging = lodgingJsonLd(locale, {
    siteName: meta('siteName'),
    description: meta('home.description'),
    amenityLabel: (id: string) => amenities(`items.${id}.label`),
  });

  return (
    <>
      <JsonLd data={lodging} />
      <JsonLd data={websiteJsonLd(locale, meta('siteName'))} />

      <Header
        variant="home"
        labels={{
          home: nav('home'),
          gallery: nav('gallery'),
          amenities: nav('amenities'),
          around: nav('around'),
          about: nav('about'),
          reviews: nav('reviews'),
          location: nav('location'),
          book: nav('book'),
          openMenu: nav('openMenu'),
          closeMenu: nav('closeMenu'),
          language: nav('language'),
          primary: nav('primary'),
          mobileMenu: nav('mobileMenu'),
        }}
      />

      <main id="main">
        <Hero />
        <QuickFacts />
        <Gallery />
        <Amenities />
        <Around />
        <About />
        <ReviewsSection />
        <MapSection />
        <Reservation />
      </main>
    </>
  );
}
