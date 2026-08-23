/// <reference types="google.maps" />

declare global {
  interface Window {
    google?: typeof google;
    /**
     * Google Maps calls this itself when it refuses the key: wrong referrer,
     * API not enabled, billing off, quota spent. It is the only programmatic
     * signal; everything else it reports goes to the console only.
     */
    gm_authFailure?: () => void;
    /**
     * Handed to the bootstrap as its `callback`, and called by Google once
     * `google.maps` is actually usable. See `MapEmbed`.
     */
    __obordeleauMapsReady?: () => void;
  }
}

export {};
