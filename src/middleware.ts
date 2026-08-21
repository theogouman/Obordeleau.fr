import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import { ADMIN_COOKIE } from '@/lib/admin-session';

const withIntl = createMiddleware(routing);

const LOGIN_PATH = '/admin/login';

/**
 * Two jobs, kept apart by the first branch.
 *
 * The console is not a visitor surface: it is French only and it never goes
 * through next-intl, so /admin must not be rewritten to /fr/admin. It is also
 * the only part of the site that is closed, and the cheapest place to turn an
 * unauthenticated request around is here, before a page renders at all.
 *
 * This is the fast gate, not the real one, and it deliberately only asks
 * whether a session cookie is there. Verifying the signature here would make
 * ADMIN_SESSION_SECRET a build time input of the edge bundle, and a secret that
 * is missing at build but present at runtime would bounce every request in a
 * circle: signed in by the page, refused by the edge, back to the login page.
 *
 * The real check runs where the secret is read at runtime. Every page and every
 * server action verifies the session on its own request, because a middleware
 * that said yes once is not evidence about the request writing to the database
 * now, and a forged cookie gets exactly as far as the next redirect.
 */
export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (pathname === LOGIN_PATH) return NextResponse.next();

    if (request.cookies.get(ADMIN_COOKIE)) return NextResponse.next();

    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = '';
    return NextResponse.redirect(url);
  }

  return withIntl(request);
}

export const config = {
  matcher: [
    // The bare root must be listed explicitly: the catch all pattern below is
    // not guaranteed to match "/", and without it the French home page (which
    // is unprefixed) never gets rewritten to /fr and returns a platform 404.
    '/',
    // Every localized path.
    '/(fr|en|de)/:path*',
    // Everything else except API routes, Next internals and files. The console
    // is covered by this one, which is how the gate above ever runs.
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
};
