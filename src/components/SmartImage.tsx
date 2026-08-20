import Image from 'next/image';
import { assetExists } from '@/lib/assets';

type Props = {
  src: string;
  alt: string;
  /** Aspect ratio is always reserved, present photo or not (CLS under 0.1). */
  aspect?: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  missingLabel: string;
  rounded?: string;
};

export function SmartImage({
  src,
  alt,
  aspect = '4 / 3',
  className = '',
  sizes = '(min-width: 1024px) 33vw, 100vw',
  priority = false,
  missingLabel,
  rounded = 'rounded-[var(--radius-card)]',
}: Props) {
  const exists = assetExists(src);

  return (
    <div
      className={`relative overflow-hidden bg-sand ${rounded} ${className}`}
      style={{ aspectRatio: aspect }}
    >
      {exists ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : 'lazy'}
          className="object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
            <path
              d="M3 6h18v12H3z M3 15l5-5 4 4 3-3 6 6"
              fill="none"
              stroke="var(--color-ink-soft)"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-sm text-ink-soft">{missingLabel}</span>
          <span className="visually-hidden">{alt}</span>
        </div>
      )}
    </div>
  );
}
