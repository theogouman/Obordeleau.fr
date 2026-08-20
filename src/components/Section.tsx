import type { ReactNode } from 'react';

type Props = {
  id?: string;
  className?: string;
  muted?: boolean;
  labelledBy?: string;
  children: ReactNode;
};

export function Section({ id, className = '', muted = false, labelledBy, children }: Props) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`section ${muted ? 'surface-muted' : ''} ${className}`}
    >
      <div className="container-page">{children}</div>
    </section>
  );
}
