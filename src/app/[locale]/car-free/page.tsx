import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GuideArticle } from '@/components/GuideArticle';
import { JsonLd } from '@/components/JsonLd';
import type { Locale } from '@/i18n/routing';
import { guide } from '@/lib/guides';
import { buildMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, guideJsonLd } from '@/lib/structured-data';

const GUIDE = guide('car-free');

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
    title: t('guides.car-free.title'),
    description: t('guides.car-free.description'),
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
          { name: meta('guides.car-free.breadcrumb'), pathname: GUIDE.pathname },
        ])}
      />
      <JsonLd
        data={guideJsonLd(locale, {
          pathname: GUIDE.pathname,
          headline: meta('guides.car-free.title'),
          description: meta('guides.car-free.description'),
          image: GUIDE.photo,
        })}
      />

      <GuideArticle guide={GUIDE} locale={locale} />
    </>
  );
}
