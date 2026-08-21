import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_SECONDS,
  ADMIN_SUBJECT,
  adminConfigured,
  signAdminSession,
  verifyAdminSession,
  type AdminSession,
} from '@/lib/admin-session';
import { callDatabase } from '@/lib/supabase';

/**
 * Signing in, and the gate every protected surface goes through.
 *
 * One password, held in `ADMIN_PASSWORD`, and no account, no address, no
 * identity provider. There is exactly one person who uses this console and she
 * knows who she is; asking her which of the one accounts she wanted was never
 * a security measure, only a second thing to lose.
 *
 * What that costs is the rate limiting that came free with an identity
 * provider, so it is written here instead, and it lives in the database rather
 * than in memory: see supabase/migrations for why.
 *
 * The session mechanism underneath is untouched. This file decides whether to
 * mint one; admin-session.ts still owns the minting.
 */

const PASSWORD = process.env.ADMIN_PASSWORD ?? '';

/** Five wrong answers close together, then a quarter of an hour of silence. */
const MAX_FAILURES = 5;
const WINDOW_MINUTES = 15;
const LOCK_MINUTES = 15;

/**
 * False until the owner has set both a signing secret and a password. The
 * console then refuses to sign anyone in rather than falling back to something
 * weaker: an admin that is open by accident is worse than an admin that is shut.
 */
export const adminReady = adminConfigured && PASSWORD !== '';

export type SignInResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'not_configured' | 'empty' | 'invalid_password' | 'rate_limited' | 'unavailable';
      retryAfterSeconds?: number;
    };

/**
 * Compares two secrets without saying how far it got.
 *
 * Both sides are hashed first, so the comparison is always over 32 bytes
 * whatever was typed: timingSafeEqual throws on unequal lengths, and the length
 * of the real password is itself something not to give away.
 */
function sameSecret(submitted: string, expected: string): boolean {
  const a = createHash('sha256').update(submitted, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

type GateRow = { locked: boolean; retry_after_seconds: number };
type FailureRow = { failures: number; locked: boolean; retry_after_seconds: number };

/** A wrong answer costs a little more each time, whatever address it came from. */
function pause(failures: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.min(failures, 5) * 250));
}

/**
 * The whole credential check.
 *
 * Order matters: a locked address is turned away before the password is
 * compared even once, so a lockout cannot be probed for timing.
 */
export async function signIn(password: string, ip: string): Promise<SignInResult> {
  // Fail closed. Without a password set there is nothing to check against, and
  // an empty submission must never be allowed to match an empty variable.
  if (!adminReady) return { ok: false, reason: 'not_configured' };
  if (password === '') return { ok: false, reason: 'empty' };

  let gate: GateRow;

  try {
    gate = await callDatabase<GateRow>('admin_login_gate', { p_ip: ip });
  } catch (error) {
    // The counter is part of the lock. Without it the door is refused rather
    // than left unguarded, which also costs nothing: the console cannot do
    // anything useful while the store is away.
    console.error('[admin] the login gate is unreachable', error);
    return { ok: false, reason: 'unavailable' };
  }

  if (gate.locked) {
    return { ok: false, reason: 'rate_limited', retryAfterSeconds: gate.retry_after_seconds };
  }

  if (sameSecret(password, PASSWORD)) {
    await callDatabase<{ ok: boolean }>('admin_login_succeeded', { p_ip: ip }).catch(() => undefined);
    return { ok: true };
  }

  const failure = await callDatabase<FailureRow>('admin_login_failed', {
    p_ip: ip,
    p_max: MAX_FAILURES,
    p_window_minutes: WINDOW_MINUTES,
    p_lock_minutes: LOCK_MINUTES,
  }).catch(() => null);

  // Slows a guesser down even when they come from a fresh address every time,
  // and costs the owner nothing on the attempt that works.
  await pause(failure?.failures ?? 1);

  if (failure?.locked) {
    return { ok: false, reason: 'rate_limited', retryAfterSeconds: failure.retry_after_seconds };
  }

  return { ok: false, reason: 'invalid_password' };
}

export async function startAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, await signAdminSession(ADMIN_SUBJECT), {
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
