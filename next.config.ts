import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * Content Security Policy.
 *
 * A defence-in-depth net: even if some text were ever reflected unescaped, this
 * bounds what a page may load and where it may talk to. It is an allowlist of
 * hosts rather than a nonce, on purpose: the document is rendered statically
 * (see the comment in src/app/layout.tsx about not reading request headers), so
 * there is no per-request nonce to hand out, and the one inline script the shell
 * ships, plus the inline chunks Next streams for hydration, need 'unsafe-inline'
 * to run. Scripts, frames and connections are still pinned to the handful of
 * third parties this site actually uses, which is where the value is.
 *
 * The hosts, and why each is here:
 *   - Stripe        js.stripe.com (SDK), hooks.stripe.com (3DS frame),
 *                   api.stripe.com / r.stripe.com (calls and metrics)
 *   - Google Maps   maps.googleapis.com + maps.gstatic.com (SDK and tiles),
 *                   *.gstatic.com / *.ggpht.com / *.googleusercontent.com (imagery)
 *   - Vercel        va.vercel-scripts.com + vitals.vercel-insights.com
 *                   (analytics and speed insights; same-origin on Vercel, these
 *                   cover the direct hosts they occasionally fall back to)
 * Fonts are self-hosted by next/font, so no font host is allowed.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://maps.googleapis.com https://maps.gstatic.com https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.stripe.com https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://*.gstatic.com https://*.ggpht.com https://*.googleusercontent.com",
  "font-src 'self' data:",
  'frame-src https://js.stripe.com https://hooks.stripe.com',
  "connect-src 'self' https://api.stripe.com https://r.stripe.com https://maps.googleapis.com https://va.vercel-scripts.com https://vitals.vercel-insights.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  'upgrade-insecure-requests',
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    // Le lint reste un gate a part entiere (npm run lint / npm run check),
    // il ne bloque pas la mise en ligne pour une regle de style.
    ignoreDuringBuilds: true,
  },
  images: {
    // All imagery is local (constitution VI: no third-party asset hosts).
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
          // Two years, subdomains included. Browsers ignore it over plain http,
          // so it only ever hardens the https the site is already served over.
          // Not preloaded: that is a separate, hard-to-undo commitment.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
