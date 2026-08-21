import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_SECONDS,
  adminConfigured,
  signAdminSession,
  verifyAdminSession,
  type AdminSession,
} from '@/lib/admin-session';

/**
 * Signing in, and the gate every protected surface goes through.
 *
 * The password never reaches this codebase's own logic: it is posted straight
 * to Supabase Auth, which owns the account and the rate limiting. A thin fetch
 * for the same reason the availability store is one (constitution X), and
 * because nothing here can then end up in a browser bundle.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const TIMEOUT_MS = 10_000;

export const adminReady = adminConfigured && SUPABASE_URL !== '' && SERVICE_ROLE_KEY !== '';

export type SignInResult =
  | { ok: true; sub: string; email: string }
  | { ok: false; reason: 'not_configured' | 'invalid_credentials' | 'unreachable' };

export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  if (!adminReady) return { ok: false, reason: 'not_configured' };

  let response: Response;

  try {
    response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { ok: false, reason: 'unreachable' };
  }

  // Wrong password and unknown account answer the same way on purpose: the
  // form must not become a way of testing which addresses exist.
  if (!response.ok) return { ok: false, reason: 'invalid_credentials' };

  const body = (await response.json()) as { user?: { id?: string; email?: string } };
  const sub = body.user?.id;
  if (!sub) return { ok: false, reason: 'invalid_credentials' };

  return { ok: true, sub, email: body.user?.email ?? email };
}

export async function startAdminSession(sub: string, email: string): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, await signAdminSession(sub, email), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ADMIN_SESSION_SECONDS,
  });
}

export async function endAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

export async function readAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  return verifyAdminSession(store.get(ADMIN_COOKIE)?.value);
}

/**
 * The gate. Called by the page and again by every server action, because the
 * page having rendered once is not proof that the request writing now is the
 * same person: an action is its own HTTP request and is checked as one.
 */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await readAdminSession();
  if (!session) redirect('/admin/login');
  return session;
}
