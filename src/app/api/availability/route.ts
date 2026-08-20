import { NextResponse, type NextRequest } from 'next/server';
import {
  DEFAULT_WINDOW_DAYS,
  MAX_WINDOW_DAYS,
  MIN_NIGHTS,
  blockedNights,
  busyRanges,
  firstBookableDate,
} from '@/lib/availability';
import { addDays, isIsoDate, todayInParis } from '@/lib/dates';
import { bookingStoreConfigured } from '@/lib/supabase';

/**
 * FR-101: the nights the calendar must grey out.
 *
 * Read only, no personal data in and none out. It never says why a night is
 * taken, only that it is, which is all the visitor needs and all a scraper
 * should get.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const today = todayInParis();

  const requestedFrom = params.get('from');
  const requestedTo = params.get('to');

  if ((requestedFrom && !isIsoDate(requestedFrom)) || (requestedTo && !isIsoDate(requestedTo))) {
    return NextResponse.json({ error: 'invalid_range' }, { status: 400 });
  }

  // Past nights are never interesting, so the window starts today at the latest.
  const from = requestedFrom && requestedFrom > today ? requestedFrom : today;
  const requestedEnd = requestedTo ?? addDays(from, DEFAULT_WINDOW_DAYS);
  const maxEnd = addDays(from, MAX_WINDOW_DAYS);

  if (requestedEnd <= from) {
    return NextResponse.json({ error: 'invalid_range' }, { status: 400 });
  }

  const to = requestedEnd > maxEnd ? maxEnd : requestedEnd;

  if (!bookingStoreConfigured) {
    // Nothing is known, so nothing is claimed free. The form still refuses the
    // submission server side, and the visitor sees the channel links.
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  try {
    const ranges = await busyRanges(from, to);

    return NextResponse.json(
      {
        from,
        to,
        firstArrival: firstBookableDate(),
        minNights: MIN_NIGHTS,
        blocked: blockedNights(ranges, from, to),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[availability] store unreachable', error);
    return NextResponse.json({ error: 'unavailable' }, { status: 502 });
  }
}
