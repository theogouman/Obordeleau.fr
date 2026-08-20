import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: [
    // The bare root must be listed explicitly: the catch all pattern below is
    // not guaranteed to match "/", and without it the French home page (which
    // is unprefixed) never gets rewritten to /fr and returns a platform 404.
    '/',
    // Every localized path.
    '/(fr|en|de)/:path*',
    // Everything else except API routes, Next internals and files.
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
};
