import type { NextRequest } from 'next/server';
import { callDatabase } from '@/lib/supabase';

/**
 * The shared rate limiter, and the address it counts by.
 *
 * The count lives in the database, in `rate_limit_hits`, for the reason the
 * admin login counter does: Vercel runs many instances of every function, so an
 * in-memory counter resets the moment a caller lands on a fresh instance, and a
 * limit that resets on demand is not a limit. One round trip to a single
 * indexed upsert is far cheaper than the query it protects (a quote walks a
 * night at a time), so the throttle is a net saving on the endpoints it guards.
 *
 * The key is the platform's own view of the client, `x-real-ip`, not the first
 * entry of `x-forwarded-for`: a caller can prepend anything to the latter and
 * so award themselves a fresh bucket on every request, which is exactly the
 * bypass this replaces.
 */

/** The address the platform saw, which the caller cannot choose for themselves. */
export function clientIp(request: NextRequest): string {
  const real = request.headers.get('x-real-ip');
  if (real && real.trim() !== '') return real.trim();

  // Fallback only. On Vercel x-real-ip is always set; this keeps a sensible key
  // in other environments rather than lumping everyone into one bucket.
  const forwarded = request.headers.get('x-forwarded-for');
  return (forwarded?.split(',')[0] ?? '').trim() || 'unknown';
}

/** How many concurrent holds one address (or email) may keep. See the migration. */
export const MAX_ACTIVE_HOLDS = 3;

/**
 * Per-endpoint budgets. Generous enough that a real visitor filling in a form,
 * paging the calendar or fumbling a card never meets them; tight enough that a
 * script cannot hammer the database or mint work for free.
 */
export const LIMITS = {
  availability: { limit: 90, windowSeconds: 60 },
  quote: { limit: 45, windowSeconds: 60 },
  stay: { limit: 45, windowSeconds: 60 },
  checkout: { limit: 8, windowSeconds: 600 },
  balanceLink: { limit: 30, windowSeconds: 60 },
} as const;

export type RateVerdict = { limited: boolean; retryAfterSeconds: number };

/**
 * Records one call and reports whether it is over budget.
 *
 * Fails open on purpose: if the counter itself is unreachable the endpoint it
 * guards is about to fail on its own database call anyway, and a throttle that
 * takes the site down when it hiccups is worse than no throttle at all.
 */
export async function rateLimit(
  endpoint: keyof typeof LIMITS,
  ip: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number } = LIMITS[endpoint],
): Promise<RateVerdict> {
  try {
    const row = await callDatabase<{ limited: boolean; retry_after_seconds: number }>(
      'rate_limit_hit',
      { p_bucket: `${endpoint}:${ip}`, p_limit: limit, p_window_seconds: windowSeconds },
    );

    return {
      limited: row.limited === true,
      retryAfterSeconds: Number(row.retry_after_seconds ?? windowSeconds),
    };
  } catch (error) {
    console.error('[rate-limit] check failed, allowing this call', endpoint, error);
    return { limited: false, retryAfterSeconds: 0 };
  }
}

/** The one shape every route sends for a refusal, so the header is never forgotten. */
export function tooManyRequests(retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ error: 'rate_limited' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Retry-After': String(Math.max(1, retryAfterSeconds)),
    },
  });
}
