import type { BusyKind, BusyRange } from '@/lib/availability';
import { toIcalDate } from '@/lib/dates';

/**
 * The master feed: one VEVENT per busy range, whatever made it busy.
 *
 * Airbnb and Booking both import this single URL, so a night taken anywhere is
 * a night blocked everywhere. Nothing personal goes in it: the SUMMARY is
 * always the same generic word, never a guest name (constitution VI).
 */

const CRLF = '\r\n';
const UID_DOMAIN = 'obordeleau.fr';
const BUSY_SUMMARY = 'Indisponible';

/** Stable across runs, so importers update a stay instead of duplicating it. */
const UID_PREFIX: Record<BusyKind, string> = {
  reservation: 'resv',
  // Exported like any other busy range. A checkout in progress is not a night
  // Airbnb may sell, and the event disappears again if the hold is abandoned.
  hold: 'hold',
  manual: 'block',
  external: 'ext',
};

/**
 * RFC 5545 folding: a content line is at most 75 octets, continued by CRLF plus
 * one space. Measured in octets, not characters, so an accent cannot push a
 * line over the limit unnoticed.
 */
function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const pieces: string[] = [];
  let current = '';
  let currentBytes = 0;
  let limit = 75;

  for (const character of line) {
    const size = encoder.encode(character).length;

    if (currentBytes + size > limit) {
      pieces.push(current);
      current = '';
      currentBytes = 0;
      // Continuation lines spend one octet on their leading space.
      limit = 74;
    }

    current += character;
    currentBytes += size;
  }

  pieces.push(current);

  return pieces.join(`${CRLF} `);
}

function stamp(now: Date): string {
  return `${now.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;
}

export function buildIcalFeed(ranges: BusyRange[], now: Date = new Date()): string {
  const dtstamp = stamp(now);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Obordeleau//Booking calendar//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Obordeleau',
  ];

  for (const range of ranges) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${UID_PREFIX[range.kind]}-${range.ref}@${UID_DOMAIN}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${toIcalDate(range.startDate)}`,
      // Exclusive, so the checkout day stays bookable by the next guest.
      `DTEND;VALUE=DATE:${toIcalDate(range.endDate)}`,
      `SUMMARY:${BUSY_SUMMARY}`,
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');

  return `${lines.map(fold).join(CRLF)}${CRLF}`;
}
