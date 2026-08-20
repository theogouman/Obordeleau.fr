/**
 * Server side access to the availability store.
 *
 * Deliberately a thin fetch wrapper over PostgREST rather than a client
 * library: one less dependency to keep current (constitution X), and nothing
 * about it can accidentally end up in a browser bundle. The service role key
 * bypasses RLS, which is exactly why it must never be exposed with a
 * NEXT_PUBLIC_ prefix and why every table here has RLS on with no policy.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const TIMEOUT_MS = 10_000;

/** False until the owner sets both keys; callers degrade instead of crashing. */
export const bookingStoreConfigured = SUPABASE_URL !== '' && SERVICE_ROLE_KEY !== '';

export class BookingStoreError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'BookingStoreError';
    this.status = status;
  }
}

/**
 * Calls a Postgres function. The availability rule and the reservation write
 * both live in the database, so the site never holds a second copy of them.
 */
export async function callDatabase<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!bookingStoreConfigured) {
    throw new BookingStoreError('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing');
  }

  let response: Response;

  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
  } catch (error) {
    throw new BookingStoreError(`${name} unreachable: ${String(error)}`);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new BookingStoreError(`${name} failed: ${body.slice(0, 300)}`, response.status);
  }

  return (await response.json()) as T;
}
