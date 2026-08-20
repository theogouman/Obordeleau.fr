type Props = {
  rating: number;
  label: string;
  className?: string;
};

/** Five glyphs, filled to the nearest half, with a text alternative. */
export function Stars({ rating, label, className = '' }: Props) {
  const rounded = Math.round(rating * 2) / 2;

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((position) => {
        const fill = Math.max(0, Math.min(1, rounded - position + 1));
        return (
          <svg
            key={position}
            viewBox="0 0 20 20"
            width="16"
            height="16"
            aria-hidden="true"
            focusable="false"
            className="shrink-0"
          >
            <defs>
              <linearGradient id={`star-${position}-${Math.round(fill * 100)}`}>
                <stop offset={`${fill * 100}%`} stopColor="var(--color-sunset)" />
                <stop offset={`${fill * 100}%`} stopColor="rgba(58,42,38,0.18)" />
              </linearGradient>
            </defs>
            <path
              fill={`url(#star-${position}-${Math.round(fill * 100)})`}
              d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.2l-4.94 2.6.94-5.5-4-3.9 5.53-.8z"
            />
          </svg>
        );
      })}
    </span>
  );
}
