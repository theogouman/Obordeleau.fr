import Image from 'next/image';
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
              aspect="2 / 3"
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

          {/* The distinction, at reading size rather than as a banner: it
              confirms what the paragraphs say instead of announcing it.
              Unoptimised because it is an SVG, which the image optimiser is
              deliberately not allowed to touch. */}
          <Image
            src="/images/annexes/airbnb-superhost.svg"
            alt={t('superhostAlt')}
            width={500}
            height={500}
            unoptimized
            className="mt-6 h-24 w-auto md:h-28"
          />
        </Reveal>
      </div>
    </Section>
  );
}
