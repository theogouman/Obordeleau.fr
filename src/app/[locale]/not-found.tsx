import { useTranslations } from 'next-intl';
import { AccentHeading } from '@/components/AccentHeading';
import { Section } from '@/components/Section';
import { Link } from '@/i18n/navigation';

export default function LocaleNotFound() {
  const t = useTranslations('notFound');

  return (
    <main id="main">
      <Section labelledBy="not-found-title">
        <div className="max-w-xl py-10">
          <AccentHeading
            as="h1"
            id="not-found-title"
            lead={t('titleLead')}
            accent={t('titleAccent')}
            tail={t('titleTail')}
            className="text-4xl md:text-6xl"
          />
          <p className="lead mt-4 text-lg text-ink-soft">{t('body')}</p>
          <Link href="/" className="btn btn-primary mt-8">
            {t('cta')}
          </Link>
        </div>
      </Section>
    </main>
  );
}
