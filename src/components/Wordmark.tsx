type Props = {
  className?: string;
  title?: string;
};

/**
 * FR-018: generated wordmark. Pure inline SVG, no external asset, so it costs
 * nothing on first paint and inherits the surrounding colour.
 */
export function Wordmark({ className = '', title = 'Obordeleau' }: Props) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        viewBox="0 0 32 32"
        width="28"
        height="28"
        aria-hidden="true"
        focusable="false"
        className="shrink-0"
      >
        {/* An arch over a waterline: the building by the water. */}
        <path
          d="M6 27V14a10 10 0 0 1 20 0v13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M2 27c2.6 0 2.6-2 5.2-2s2.6 2 5.2 2 2.6-2 5.2-2 2.6 2 5.2 2 2.6-2 5.2-2 2.6 2 5.2 2"
          fill="none"
          stroke="var(--color-coral)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span className="font-display text-xl tracking-tight">
        Oborde<span className="accent-word">leau</span>
      </span>
      <span className="visually-hidden">{title}</span>
    </span>
  );
}
