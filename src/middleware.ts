import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: [
    // Everything except API routes, Next internals and files with an extension.
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
};
