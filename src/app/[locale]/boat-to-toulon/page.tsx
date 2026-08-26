import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GuideArticle } from '@/components/GuideArticle';
import { JsonLd } from '@/components/JsonLd';
import type { Locale } from '@/i18n/routing';
import { guide } from '@/lib/guides';
import { buildMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, guideJsonLd } from '@/lib/structured-data';

const GUIDE = guide('boat-to-toulon');

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });

  return buildMetadata({
    locale,
    pathname: GUIDE.pathname,
    title: t('guides.boat-to-toulon.title'),
    description: t('guides.boat-to-toulon.description'),
    siteName: t('siteName'),
  });
}

export default async function GuidePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const meta = await getTranslations({ locale, namespace: 'meta' });
  const nav = await getTranslations({ locale, namespace: 'nav' });

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd(locale, [
          { name: nav('home'), pathname: '/' },
          { name: meta('guides.boat-to-toulon.breadcrumb'), pathname: GUIDE.pathname },
        ])}
      />
      <JsonLd
        data={guideJsonLd(locale, {
          pathname: GUIDE.pathname,
          headline: meta('guides.boat-to-toulon.title'),
          description: meta('guides.boat-to-toulon.description'),
          image: GUIDE.photo,
        })}
      />

      <GuideArticle guide={GUIDE} locale={locale} />
    </>
  );
}
