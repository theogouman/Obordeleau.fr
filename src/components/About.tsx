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
            {/* The distinction belongs to the person in the photograph, so it
                is pinned to her portrait rather than left as a footnote to the
                paragraphs. It is a sibling of the arch and not a child of it,
                because the arch clips and the badge overhangs its left edge.
                Unoptimised because it is an SVG, which the image optimiser is
                deliberately not allowed to touch. */}
            <div className="host-portrait mx-auto max-w-xs">
              <SmartImage
                src={`/images/host/${host.portrait}`}
                alt={t('portraitAlt')}
                aspect="2 / 3"
                sizes="(min-width: 768px) 30vw, 80vw"
                rounded="arch"
                missingLabel={gallery('missing')}
                className="host-portrait__photo"
              />

              <div className="host-portrait__badge">
                <Image
                  src="/images/annexes/airbnb-superhost.svg"
                  alt={t('superhostAlt')}
                  width={450}
                  height={275}
                  unoptimized
                  className="host-portrait__mark"
                />
              </div>
            </div>
          </Reveal>
        ) : null}

        {/* On one column the portrait is capped at the same width the words are
            given here, so the block reads as one centred column rather than as
            a picture floating inside a wider paragraph. Two columns take the
            cap off: there the words have a column of their own. */}
        <Reveal delay={80} className="mx-auto w-full max-w-xs md:max-w-none">
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
        </Reveal>
      </div>
    </Section>
  );
}
