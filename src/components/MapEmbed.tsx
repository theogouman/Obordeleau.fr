'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { trackMapConsent } from '@/lib/analytics';

export type MapLabels = {
  consentTitle: string;
  consentBody: string;
  accept: string;
  remember: string;
  privacyLink: string;
  reset: string;
  openExternal: string;
  openExternalHint: string;
  unavailable: string;
  markerAlt: string;
  placeholderAlt: string;
  loading: string;
};

type Props = {
  apiKey: string;
  mapId: string;
  latitude: number;
  longitude: number;
  locale: string;
  labels: MapLabels;
  externalUrl: string;
  privacyHref: string;
};

const STORAGE_KEY = 'obordeleau:map-consent';

/**
 * FR-012 and constitution VI: not a single byte leaves for Google before the
 * visitor clicks accept. The placeholder occupies the exact same box as the
 * map, so accepting causes no layout shift.
 */
export function MapEmbed({
  apiKey,
  mapId,
  latitude,
  longitude,
  locale,
  labels,
  externalUrl,
  privacyHref,
}: Props) {
  const [consented, setConsented] = useState(false);
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === 'granted') setConsented(true);
    } catch {
      // Storage can be blocked; the gate simply stays closed.
    }
  }, []);

  const accept = useCallback(() => {
    setConsented(true);
    if (remember) {
      try {
        window.localStorage.setItem(STORAGE_KEY, 'granted');
      } catch {
        // Nothing to do, the choice just is not remembered.
      }
    }
    trackMapConsent(locale);
  }, [remember, locale]);

  const revoke = useCallback(() => {
    setConsented(false);
    setStatus('idle');
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignored on purpose.
    }
  }, []);

  useEffect(() => {
    if (!consented || !apiKey || status !== 'idle') return;

    let cancelled = false;
    setStatus('loading');

    const load = async () => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-google-maps]');

      if (!existing) {
        const params = new URLSearchParams({
          key: apiKey,
          v: 'weekly',
          libraries: 'maps,marker',
          language: locale,
          region: 'FR',
          loading: 'async',
        });
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
        script.async = true;
        script.dataset.googleMaps = 'true';
        document.head.appendChild(script);

        await new Promise<void>((resolve, reject) => {
          script.addEventListener('load', () => resolve());
          script.addEventListener('error', () => reject(new Error('maps script failed')));
        });
      } else if (!window.google?.maps) {
        await new Promise<void>((resolve, reject) => {
          existing.addEventListener('load', () => resolve());
          existing.addEventListener('error', () => reject(new Error('maps script failed')));
        });
      }

      if (cancelled || !containerRef.current) return;

      const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
      const { AdvancedMarkerElement, PinElement } = (await google.maps.importLibrary(
        'marker',
      )) as google.maps.MarkerLibrary;

      if (cancelled || !containerRef.current) return;

      const position = { lat: latitude, lng: longitude };
      const map = new Map(containerRef.current, {
        center: position,
        zoom: 16,
        mapId: mapId || undefined,
        disableDefaultUI: false,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      });

      const pin = new PinElement({
        background: '#CE4257',
        borderColor: '#A8253C',
        glyphColor: '#FAF7F2',
        scale: 1.2,
      });

      new AdvancedMarkerElement({
        map,
        position,
        title: labels.markerAlt,
        content: pin.element,
      });

      if (!cancelled) setStatus('ready');
    };

    load().catch(() => {
      if (!cancelled) setStatus('error');
    });

    return () => {
      cancelled = true;
    };
  }, [consented, apiKey, mapId, latitude, longitude, locale, labels.markerAlt, status]);

  const frame = 'relative w-full overflow-hidden rounded-[var(--radius-card)] bg-sand';
  const frameStyle = { aspectRatio: '16 / 10' } as const;

  if (!apiKey) {
    return (
      <div className={frame} style={frameStyle}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-ink-soft">{labels.unavailable}</p>
          <a
            className="btn btn-secondary"
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {labels.openExternal}
          </a>
        </div>
      </div>
    );
  }

  if (!consented) {
    return (
      <div className={frame} style={frameStyle}>
        {/* Static, cookie free placeholder. No network request at all. */}
        <StaticMapArtwork title={labels.placeholderAlt} />
        <div className="absolute inset-0 flex items-center justify-center bg-[rgba(250,247,242,0.86)] p-5">
          <div className="max-w-md text-center">
            <h3 className="font-display text-xl">{labels.consentTitle}</h3>
            <p className="mt-2 text-sm text-ink-soft">{labels.consentBody}</p>

            <label className="mt-4 inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                className="size-4 accent-[var(--color-raspberry)]"
              />
              {labels.remember}
            </label>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={accept} className="btn btn-primary">
                {labels.accept}
              </button>
              <a
                className="btn btn-secondary"
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {labels.openExternal}
                <span className="visually-hidden"> {labels.openExternalHint}</span>
              </a>
            </div>

            <p className="mt-3 text-sm">
              <a className="text-raspberry-ink underline underline-offset-4" href={privacyHref}>
                {labels.privacyLink}
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={frame} style={frameStyle}>
        <div ref={containerRef} className="absolute inset-0" role="application" aria-label={labels.markerAlt} />
        {status === 'loading' ? (
          <p className="absolute inset-0 flex items-center justify-center text-ink-soft">
            {labels.loading}
          </p>
        ) : null}
        {status === 'error' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-sand p-6 text-center">
            <p className="text-ink-soft">{labels.unavailable}</p>
            <a
              className="btn btn-secondary"
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {labels.openExternal}
            </a>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={revoke}
        className="mt-3 text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
      >
        {labels.reset}
      </button>
    </div>
  );
}

/** Brand coloured stand in for the map: pure SVG, no request, no cookie. */
function StaticMapArtwork({ title }: { title: string }) {
  return (
    <svg
      viewBox="0 0 320 200"
      className="absolute inset-0 size-full"
      role="img"
      aria-label={title}
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="320" height="200" fill="#F1EAE0" />
      <path d="M0 132c60 8 110 22 320 10v58H0z" fill="#CDE2E4" />
      <path d="M0 120c70 10 120 24 320 12v14c-210 12-260-2-320-10z" fill="#E4D8C6" />
      <g stroke="#D8CBB8" strokeWidth="6" fill="none">
        <path d="M-10 60h340M60 -10v220M210 -10v220" />
      </g>
      <g fill="#B9CBA6">
        <circle cx="120" cy="96" r="16" />
        <circle cx="150" cy="104" r="12" />
        <circle cx="96" cy="108" r="10" />
      </g>
      <circle cx="210" cy="60" r="9" fill="#CE4257" />
      <circle cx="210" cy="60" r="18" fill="none" stroke="#CE4257" strokeWidth="2" opacity="0.5" />
    </svg>
  );
}
