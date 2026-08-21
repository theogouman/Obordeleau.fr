import { Link } from '@/i18n/navigation';

/**
 * The way out of the teaser: a small letterspaced line asking the question,
 * the invitation under it in the size of a title. It is the eyebrow and
 * heading pairing the rest of the site uses, put inside a button.
 */

type Props = {
  lead: string;
  main: string;
  className?: string;
};

export function ReviewsCta({ lead, main, className = '' }: Props) {
  return (
    <Link href="/reviews" className={`btn btn-primary reviews-cta ${className}`}>
      <span className="reviews-cta__lead">{lead}</span>
      <span className="reviews-cta__main">{main}</span>
    </Link>
  );
}
