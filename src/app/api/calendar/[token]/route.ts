import { NextResponse, type NextRequest } from 'next/server';
import { busyRanges } from '@/lib/availability';
import { todayInParis } from '@/lib/dates';
import { buildIcalFeed } from '@/lib/ical';
import { bookingStoreConfigured } from '@/lib/supabase';

/**
 * FR-102: the one public feed, at /api/calendar/<ICAL_FEED_TOKEN>.ics.
 *
 * The owner pastes this single URL into Airbnb and into Booking. It carries
 * every busy range from all three sources, with a generic summary and a stable
 * UID per row, and a DTEND that is exclusive so a checkout day can be the next
 * arrival. A plain GET, because that is all an importer knows how to do; the
 * token in the path is what keeps it from being guessable.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Compares in constant time so the token cannot be recovered a byte at a time. */
function tokenMatches(candidate: string, expected: string): boolean {
  if (expected === '' || candidate.length !== expected.length) return false;

  let difference = 0;
  for (let index = 0; index < candidate.length; index += 1) {
    difference |= candidate.charCodeAt(index) ^ expected.charCodeAt(index);
  }

  return difference === 0;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const expected = process.env.ICAL_FEED_TOKEN ?? '';

  // A missing token means the feed is not published yet: same answer as a wrong
  // one, so probing tells nobody whether the feature exists.
  if (!tokenMatches(token.replace(/\.ics$/i, ''), expected) || !bookingStoreConfigured) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    // No upper bound: a stay booked three years out still has to block.
    const ranges = await busyRanges(todayInParis(), null);

    return new NextResponse(buildIcalFeed(ranges), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="obordeleau.ics"',
        // Never a stale feed: a platform importing this must see the last booking.
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  } catch (error) {
    console.error('[calendar] store unreachable', error);
    return new NextResponse('Calendar temporarily unavailable', { status: 503 });
  }
}
