'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type MapLabels = {
  openExternal: string;
  openExternalHint: string;
  unavailable: string;
  loadError: string;
  markerAlt: string;
  loading: string;
  retry: string;
};

type Props = {
  apiKey: string;
  mapId: string;
  latitude: number;
  longitude: number;
  locale: string;
  labels: MapLabels;
  externalUrl: string;
};

/**
 * The map loads on page load, at the owner's explicit request. Google therefore
 * receives the visitor's IP address without a prior click, which is a
 * deliberate departure from the consent gate described in constitution VI and
 * FR-012. The privacy policy states this plainly, on its own page.
 */

/** How long the script gets before the attempt is called a failure. */
const SCRIPT_TIMEOUT_MS = 12_000;
/** Network hiccups are the common case, so an attempt is worth repeating. */
const ATTEMPTS = 3;
const BACKOFF_MS = 600;

/**
 * One loader for the whole document, not one per mount.
 *
 * The map used to add a script tag and listen for its load event. That is
 * wrong twice over: React mounts an effect twice in development, so two tags
 * were added, and a tag that had already finished loading never fires `load`
 * again, so a second mount waited for an event that was never coming and the
 * frame sat on "loading" for ever. A promise held here is shared by every
 * mount, and a failed attempt clears it so the next one starts clean.
 */
let loader: Promise<void> | null = null;

function mapsReady(): boolean {
  return typeof window !== 'undefined' && typeof window.google?.maps?.importLibrary === 'function';
}

function loadMapsScript(apiKey: string, locale: string): Promise<void> {
  if (mapsReady()) return Promise.resolve();
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-maps]');
    const script = existing ?? document.createElement('script');
    let settled = false;

    const done = () => {
      settled = true;
      window.clearTimeout(timer);
    };

    const fail = (reason: string) => {
      if (settled) return;
      done();
      // Leave nothing behind: the next attempt has to be able to add its own
      // tag rather than wait on a corpse.
      script.remove();
      loader = null;
      reject(new Error(reason));
    };

    const timer = window.setTimeout(() => fail('maps script timed out'), SCRIPT_TIMEOUT_MS);

    script.addEventListener('load', () => {
      if (settled) return;
      done();
      resolve();
    });
    script.addEventListener('error', () => fail('maps script failed'));

    if (!existing) {
      const params = new URLSearchParams({
        key: apiKey,
        v: 'weekly',
        libraries: 'maps,marker',
        language: locale,
        region: 'FR',
        loading: 'async',
      });
      script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
      script.async = true;
      script.dataset.googleMaps = 'true';
      document.head.appendChild(script);
    } else if (mapsReady()) {
      // It arrived between the two checks above.
      done();
      resolve();
    }
  });

  return loader;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function MapEmbed({
  apiKey,
  mapId,
  latitude,
  longitude,
  locale,
  labels,
  externalUrl,
}: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const retry = useCallback(() => {
    loader = null;
    document.querySelector('script[data-google-maps]')?.remove();
    setStatus('loading');
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!apiKey) return;

    let cancelled = false;

    // Google refuses a key by calling this, and by printing the precise reason
    // (RefererNotAllowedMapError, OverQuotaMapError, ApiNotActivatedMapError and
    // friends) to the console. A refused key still fires the script's load
    // event, so without this hook the failure would be silent.
    const previousAuthFailure = window.gm_authFailure;
    let refused = false;
    window.gm_authFailure = () => {
      refused = true;
      console.error(
        '[map] Google refused the Maps JavaScript key. The exact reason is the ' +
          '"Google Maps JavaScript API error: ...MapError" line in this console. ' +
          'A referrer error means this hostname is missing from the key allowlist.',
      );
      previousAuthFailure?.();
      if (!cancelled) setStatus('error');
    };

    const draw = async () => {
      await loadMapsScript(apiKey, locale);
      if (cancelled || refused || !containerRef.current) return;

      const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
      const { AdvancedMarkerElement, PinElement } = (await google.maps.importLibrary(
        'marker',
      )) as google.maps.MarkerLibrary;

      if (cancelled || refused || !containerRef.current) return;

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

    // A refused key is a settled answer, so it is never retried. Everything
    // else here is a transport failure, and those are worth a second go.
    const run = async () => {
      for (let index = 1; index <= ATTEMPTS; index += 1) {
        try {
          await draw();
          return;
        } catch (error) {
          if (cancelled || refused) return;
          console.error(`[map] attempt ${index} of ${ATTEMPTS} failed`, error);
          if (index === ATTEMPTS) throw error;
          loader = null;
          await wait(BACKOFF_MS * index);
          if (cancelled) return;
        }
      }
    };

    run().catch(() => {
      if (!cancelled) setStatus('error');
    });

    return () => {
      cancelled = true;
      window.gm_authFailure = previousAuthFailure;
    };
  }, [apiKey, mapId, latitude, longitude, locale, labels.markerAlt, attempt]);

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
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={retry} className="btn btn-primary">
              {labels.retry}
            </button>
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
      ) : null}
    </div>
  );
}
