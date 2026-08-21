/**
 * The admin session cookie.
 *
 * Credentials are checked by Supabase Auth, which owns the account, the hashing
 * and the rate limiting. What this file owns is the small signed note that says
 * "this browser passed that check", so every later request is answered without
 * another round trip.
 *
 * Written on Web Crypto and nothing else, because it has to verify in two
 * places at once: the middleware, which runs on the edge runtime and has no
 * node:crypto, and the server components and actions, which run on Node. One
 * implementation, no dependency, no divergence.
 */

const encoder = new TextEncoder();

export const ADMIN_COOKIE = 'obd_admin';

/** Long enough for an afternoon of pricing work, short enough to matter. */
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;

export type AdminSession = {
  /** The Supabase user id. */
  sub: string;
  email: string;
  /** Unix seconds. */
  exp: number;
};

const SECRET = process.env.ADMIN_SESSION_SECRET ?? '';

/**
 * False until the owner sets a secret. The console then refuses to sign anyone
 * in rather than falling back to something weaker: an admin that is open by
 * accident is worse than an admin that is shut.
 */
export const adminConfigured = SECRET.length >= 32;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signAdminSession(sub: string, email: string): Promise<string> {
  const payload: AdminSession = {
    sub,
    email,
    exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS,
  };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Null for anything that is not a live, correctly signed session. The
 * comparison is crypto.subtle.verify rather than a string equality, so it does
 * not leak the signature one character at a time.
 */
export async function verifyAdminSession(token: string | undefined): Promise<AdminSession | null> {
  if (!adminConfigured || !token) return null;

  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;

  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(),
      fromBase64Url(signature),
      encoder.encode(body),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as AdminSession;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;
    if (typeof payload.sub !== 'string' || payload.sub === '') return null;
    return payload;
  } catch {
    return null;
  }
}
