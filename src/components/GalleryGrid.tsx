'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

export type GalleryItemView = {
  src: string;
  alt: string;
  available: boolean;
};

type Props = {
  items: GalleryItemView[];
  labels: {
    open: string;
    close: string;
    previous: string;
    next: string;
    counter: string;
    missing: string;
  };
};

function counterText(template: string, current: number, total: number) {
  return template.replace('{current}', String(current)).replace('{total}', String(total));
}

export function GalleryGrid({ items, labels }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggersRef = useRef<Array<HTMLButtonElement | null>>([]);

  const openable = items.filter((item) => item.available).length > 0;

  const close = useCallback(() => {
    const index = openIndex;
    setOpenIndex(null);
    dialogRef.current?.close();
    if (index !== null) triggersRef.current[index]?.focus();
  }, [openIndex]);

  const step = useCallback(
    (direction: 1 | -1) => {
      setOpenIndex((current) => {
        if (current === null) return current;
        const total = items.length;
        let next = current;
        for (let i = 0; i < total; i += 1) {
          next = (next + direction + total) % total;
          if (items[next].available) break;
        }
        return next;
      });
    },
    [items],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (openIndex !== null && !dialog.open) dialog.showModal();

    const onCancel = (event: Event) => {
      event.preventDefault();
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    };

    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('keydown', onKey);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('keydown', onKey);
    };
  }, [openIndex, close, step]);

  const current = openIndex === null ? null : items[openIndex];

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        {items.map((item, index) => (
          <li key={item.src} className={index === 0 ? 'col-span-2 md:col-span-2 md:row-span-2' : ''}>
            <button
              type="button"
              ref={(node) => {
                triggersRef.current[index] = node;
              }}
              disabled={!item.available}
              onClick={() => setOpenIndex(index)}
              aria-label={`${labels.open}: ${item.alt}`}
              className="card card-tilt group block w-full overflow-hidden p-0 disabled:cursor-default"
            >
              <span
                className="relative block w-full overflow-hidden rounded-[var(--radius-card)] bg-sand"
                style={{ aspectRatio: index === 0 ? '4 / 3' : '1 / 1' }}
              >
                {item.available ? (
                  <Image
                    src={item.src}
                    alt={item.alt}
                    fill
                    sizes={index === 0 ? '(min-width: 768px) 60vw, 100vw' : '(min-width: 768px) 30vw, 50vw'}
                    className="object-cover"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center p-3 text-center text-sm text-ink-soft">
                    {labels.missing}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {openable ? (
        <dialog
          ref={dialogRef}
          aria-label={current?.alt}
          className="m-auto w-[min(96vw,64rem)] rounded-[var(--radius-card)] bg-night p-0 text-cream backdrop:bg-[rgba(42,30,27,0.8)]"
        >
          {current ? (
            <div className="flex flex-col">
              <div className="relative aspect-[4/3] w-full bg-night">
                {current.available ? (
                  <Image
                    src={current.src}
                    alt={current.alt}
                    fill
                    sizes="96vw"
                    className="object-contain"
                  />
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-3 p-4">
                <p className="text-sm text-cream/80">
                  {counterText(labels.counter, (openIndex ?? 0) + 1, items.length)}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    className="rounded-[var(--radius-pill)] border border-cream/30 px-3 py-1.5 text-sm"
                  >
                    {labels.previous}
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    className="rounded-[var(--radius-pill)] border border-cream/30 px-3 py-1.5 text-sm"
                  >
                    {labels.next}
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-[var(--radius-pill)] bg-cream px-3 py-1.5 text-sm text-night"
                  >
                    {labels.close}
                  </button>
                </div>
              </div>
              <p className="px-4 pb-4 text-sm text-cream/70">{current.alt}</p>
            </div>
          ) : null}
        </dialog>
      ) : null}
    </>
  );
}
