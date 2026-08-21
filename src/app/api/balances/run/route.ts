import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { runnerSecret } from '@/lib/balances';
import { runDueBalances } from '@/lib/balance-runner';
import { paymentsConfigured } from '@/lib/stripe';
import { bookingStoreConfigured } from '@/lib/supabase';

/**
 * The daily balance run.
 *
 * Called by pg_cron through pg_net, on the Phase 2 pattern: the shared secret
 * is generated inside the database, sent in a header, and read back here
 * through the service role. It is in no environment variable and was never
 * copied by hand, so rotating it is one update and no deploy.
 *
 * The console has a button for the same work, but it calls the runner directly
 * as a server action rather than posting here: a server action is already on
 * the server, and a process asking itself over http is a way to lose an error.
 *
 * Stripe's secret key stays here and never goes near the database. The database
 * decides who is due; this decides nothing except when to ask.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SECRET_KEY = 'balance_secret';

/** Length first, then constant time: a mismatched length is not a timing leak. */
function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function authorised(request: NextRequest): Promise<boolean> {
  const header = request.headers.get('x-balance-secret');
  if (!header) return false;

  const expected = await runnerSecret(SECRET_KEY);
  return expected !== null && sameSecret(header, expected);
}

export async function POST(request: NextRequest) {
  if (!bookingStoreConfigured) {
    console.error('[balance] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing');
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  if (!(await authorised(request))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  if (!paymentsConfigured) {
    return NextResponse.json({ error: 'payments_unavailable' }, { status: 503 });
  }

  try {
    const summary = await runDueBalances();
    console.info('[balance] run finished', summary);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    // A 500 is the honest answer, and pg_net records it: a run that did not
    // happen must not look like a run that found nothing.
    console.error('[balance] the run failed', error);
    return NextResponse.json({ error: 'run_failed' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
