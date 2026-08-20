'use client';

import { useEffect, useRef, useState } from 'react';

export type MapLabels = {
  openExternal: string;
  openExternalHint: string;
  unavailable: string;
  loadError: string;
  markerAlt: string;
  loading: string;
  thirdPartyNotice: string;
  privacyLink: string;
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

/**
 * The map loads on page load, at the owner's explicit request. Google therefore
 * receives the visitor's IP address without a prior click, which is a
 * deliberate departure from the consent gate described in constitution VI and
 * FR-012. The privacy policy states this plainly, and the notice below names
 * the third party in the interface itself.
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
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!apiKey) return;

    let cancelled = false;

    // Google refuses a key by calling this, and by printing the precise reason
    // (RefererNotAllowedMapError, OverQuotaMapError, ApiNotActivatedMapError and
    // friends) to the console. Without this hook the promise below can stay
    // pending for ever and the frame keeps saying "loading".
    const previousAuthFailure = window.gm_authFailure;
    window.gm_authFailure = () => {
      console.error(
        '[map] Google refused the Maps JavaScript key. The exact reason is the ' +
          '"Google Maps JavaScript API error: ...MapError" line in this console.',
      );
      previousAuthFailure?.();
      if (!cancelled) setStatus('error');
    };

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

    load().catch((error) => {
      console.error('[map] could not initialise Google Maps', error);
      if (!cancelled) setStatus('error');
    });

    return () => {
      cancelled = true;
      window.gm_authFailure = previousAuthFailure;
    };
  }, [apiKey, mapId, latitude, longitude, locale, labels.markerAlt]);

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

  return (
    <div>
      <div className={frame} style={frameStyle}>
        <div
          ref={containerRef}
          className="absolute inset-0"
          role="application"
          aria-label={labels.markerAlt}
        />
        {status === 'loading' ? (
          <p className="absolute inset-0 flex items-center justify-center text-ink-soft">
            {labels.loading}
          </p>
        ) : null}
        {status === 'error' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-sand p-6 text-center">
            <p className="text-ink-soft">{labels.loadError}</p>
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

      <p className="mt-3 text-sm text-ink-soft">
        {labels.thirdPartyNotice}{' '}
        <a className="text-raspberry-ink underline underline-offset-4" href={privacyHref}>
          {labels.privacyLink}
        </a>
      </p>
    </div>
  );
}
