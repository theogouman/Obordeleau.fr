import { useTranslations } from 'next-intl';
import { AccentHeading } from '@/components/AccentHeading';
import { Reveal } from '@/components/Reveal';
import { Section } from '@/components/Section';
import { SmartImage } from '@/components/SmartImage';
import { host } from '@/lib/content';

/**
 * Constitution VII: the host is present but in support. First person, short,
 * no celebration of exceptional hosting.
 */
export function About() {
  const t = useTranslations('about');
  const gallery = useTranslations('gallery');
  const paragraphs = t.raw('paragraphs') as string[];

  return (
    <Section id="about" muted labelledBy="about-title">
      <div className="grid items-center gap-10 md:grid-cols-[0.7fr_1fr]">
        {host.showPortrait ? (
          <Reveal>
            <SmartImage
              src={`/images/host/${host.portrait}`}
              alt={t('portraitAlt')}
              aspect="4 / 5"
              sizes="(min-width: 768px) 30vw, 80vw"
              rounded="arch"
              missingLabel={gallery('missing')}
              className="mx-auto max-w-xs"
            />
          </Reveal>
        ) : null}

        <Reveal delay={80}>
          <AccentHeading
            id="about-title"
            lead={t('titleLead')}
            accent={t('titleAccent')}
            tail={t('titleTail')}
          />
          <div className="mt-5 space-y-4 text-lg text-ink-soft">
            {paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 24)}>{paragraph}</p>
            ))}
          </div>
          <p className="mt-6 font-display text-2xl italic">{t('signature')}</p>
        </Reveal>
      </div>
    </Section>
  );
}
