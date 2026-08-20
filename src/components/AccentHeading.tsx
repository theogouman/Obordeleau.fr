import type { ElementType, ReactNode } from 'react';

type Props = {
  /** Text before the italic accent word. */
  lead?: string;
  /** The single italic word that signs every major heading. */
  accent: string;
  /** Text after the accent word. */
  tail?: string;
  as?: ElementType;
  className?: string;
  id?: string;
  children?: ReactNode;
};

export function AccentHeading({
  lead,
  accent,
  tail,
  as: Tag = 'h2',
  className = '',
  id,
  children,
}: Props) {
  return (
    <Tag id={id} className={`text-3xl md:text-5xl ${className}`}>
      {lead ? `${lead} ` : null}
      <span className="accent-word">{accent}</span>
      {tail ? ` ${tail}` : null}
      {children}
    </Tag>
  );
}
