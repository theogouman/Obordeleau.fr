import { Link } from '@/i18n/navigation';

/**
 * The way out of the teaser: a question in a small hand, the invitation under
 * it in a large one, and both lines exactly as wide as each other so the two
 * read as a single block rather than as a label with a caption stuck on top.
 *
 * Equal width is what fixes the sizes, and it cannot be a pair of numbers
 * chosen by eye: the same button carries three languages, and a line that is
 * short in French is not short in German. So each line is set at the size that
 * makes its own length fill the block, and the justification below closes
 * whatever the estimate got wrong. The estimate only has to be close enough
 * that the correction stays invisible.
 */

/** Width of the text inside the button, in rem, and the mean width of a glyph. */
const BLOCK = 12.5;
const GLYPH = 0.52;

function sizeFor(line: string): string {
  const size = BLOCK / (GLYPH * Math.max(line.length, 1));
  return `${Math.min(1.55, Math.max(0.8, size)).toFixed(3)}rem`;
}

type Props = {
  lead: string;
  main: string;
  className?: string;
};

export function ReviewsCta({ lead, main, className = '' }: Props) {
  return (
    <Link href="/reviews" className={`btn btn-primary reviews-cta ${className}`}>
      <span className="reviews-cta__lead" style={{ fontSize: sizeFor(lead) }}>
        {lead}
      </span>
      <span className="reviews-cta__main" style={{ fontSize: sizeFor(main) }}>
        {main}
      </span>
    </Link>
  );
}
