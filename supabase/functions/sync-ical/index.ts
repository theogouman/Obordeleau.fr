/**
 * sync-ical: pulls every active iCal source into `external_blocks`.
 *
 * Multi source by design. Airbnb is the first row, Booking is just another row.
 * Every VEVENT means "busy", whether the platform calls it a reservation or a
 * block, so no distinction is kept.
 *
 * Fail closed (constitution VIII): a source is reconciled, meaning stale rows
 * are deleted, only when every active source of that platform was fetched and
 * parsed successfully in this run. A broken feed therefore keeps its last good
 * blocks instead of freeing dates that may well be taken.
 *
 * Called by pg_cron through pg_net every 15 minutes. Auth is a shared secret in
 * the `x-sync-secret` header; there is no JWT on that call. The expected value
 * comes from the SYNC_SECRET env var, or, when that is not set, from
 * `sync_config.sync_secret`, a table only the service role can read. The second
 * form lets the schedule and the function share one secret set purely in SQL.
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SYNC_SECRET = Deno.env.get('SYNC_SECRET') ?? '';

const FETCH_TIMEOUT_MS = 20_000;
const UPSERT_CHUNK = 500;

type Platform = 'airbnb' | 'booking';

type IcalSource = {
  id: string;
  platform: Platform;
  url: string;
};

type BusyEvent = {
  uid: string;
  summary: string | null;
  start: string;
  end: string;
};

type SourceReport = {
  id: string;
  platform: Platform;
  status: 'ok' | 'error';
  events?: number;
  error?: string;
};

/* -------------------------------------------------------------------------- */
/* iCal parsing                                                               */
/* -------------------------------------------------------------------------- */

/** RFC 5545 line unfolding: a leading space or tab continues the line before. */
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines: string[] = [];

  for (const line of raw) {
    if (lines.length > 0 && (line.startsWith(' ') || line.startsWith('\t'))) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }

  return lines;
}

function unescapeText(value: string | undefined): string | null {
  if (value === undefined) return null;
  const text = value
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
  return text === '' ? null : text.slice(0, 500);
}

/**
 * Takes the date part of a DATE or DATE-TIME value. Platform feeds use all day
 * DATE values; a DATE-TIME is reduced to its calendar day, which lands on the
 * same night for a checkout time.
 */
function toIsoDate(value: string | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toBusyEvent(fields: Record<string, string>): BusyEvent | null {
  if ((fields.STATUS ?? '').trim().toUpperCase() === 'CANCELLED') return null;

  const start = toIsoDate(fields.DTSTART);
  if (!start) return null;

  // DTEND is exclusive. A feed that omits it means a single night.
  let end = toIsoDate(fields.DTEND);
  if (!end || end <= start) end = addDays(start, 1);

  const uid = (fields.UID ?? '').trim();

  return {
    uid: (uid === '' ? `${start}_${end}` : uid).slice(0, 400),
    summary: unescapeText(fields.SUMMARY),
    start,
    end,
  };
}

function parseCalendar(ics: string): BusyEvent[] {
  const events: BusyEvent[] = [];
  let current: Record<string, string> | null = null;

  for (const line of unfold(ics)) {
    const trimmed = line.trim();

    if (trimmed.toUpperCase() === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }

    if (trimmed.toUpperCase() === 'END:VEVENT') {
      if (current) {
        const event = toBusyEvent(current);
        if (event) events.push(event);
      }
      current = null;
      continue;
    }

    if (!current) continue;

    const colon = line.indexOf(':');
    if (colon === -1) continue;

    // "DTSTART;VALUE=DATE:20260912" -> name "DTSTART", value "20260912".
    const name = line.slice(0, colon).split(';')[0].trim().toUpperCase();
    if (name === '') continue;
    current[name] = line.slice(colon + 1);
  }

  return events;
}

/* -------------------------------------------------------------------------- */
/* Supabase REST                                                              */
/* -------------------------------------------------------------------------- */

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`supabase ${response.status} on ${path}: ${body.slice(0, 300)}`);
  }

  return response;
}

/* -------------------------------------------------------------------------- */
/* Sync                                                                       */
/* -------------------------------------------------------------------------- */

async function fetchCalendar(url: string): Promise<BusyEvent[]> {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.8',
      'User-Agent': 'Obordeleau-calendar-sync/1.0 (+https://www.obordeleau.fr)',
    },
  });

  if (!response.ok) {
    throw new Error(`feed responded ${response.status}`);
  }

  const body = await response.text();

  // A 200 that is not a calendar is an error page, not an emptied calendar.
  // Treating it as empty would free every date the platform has taken.
  if (!/BEGIN:VCALENDAR/i.test(body)) {
    throw new Error('response is not an iCalendar document');
  }

  return parseCalendar(body);
}

async function upsertBlocks(
  platform: Platform,
  events: BusyEvent[],
  seenAt: string,
): Promise<void> {
  const rows = events.map((event) => ({
    platform,
    uid: event.uid,
    summary: event.summary,
    start_date: event.start,
    end_date: event.end,
    last_seen_at: seenAt,
  }));

  for (let index = 0; index < rows.length; index += UPSERT_CHUNK) {
    await rest('external_blocks?on_conflict=platform,uid,start_date', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(index, index + UPSERT_CHUNK)),
    });
  }
}

async function patchSource(id: string, patch: Record<string, unknown>): Promise<void> {
  await rest(`ical_sources?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
}

async function run(): Promise<Record<string, unknown>> {
  // One stamp for the whole run, written explicitly, so the stale sweep below
  // never depends on the clock agreeing between Deno and Postgres.
  const runStamp = new Date().toISOString();
  const todayParis = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const sources = (await (
    await rest('ical_sources?select=id,platform,url&active=is.true&order=platform')
  ).json()) as IcalSource[];

  const reports: SourceReport[] = [];
  const platformHealth = new Map<Platform, boolean>();

  for (const source of sources) {
    if (!platformHealth.has(source.platform)) platformHealth.set(source.platform, true);

    try {
      const events = await fetchCalendar(source.url);

      // Past stays are of no use to anyone and would grow the table for ever.
      const future = events.filter((event) => event.end > todayParis);

      // One VEVENT per (uid, start) only: a repeated key would make the upsert
      // touch the same row twice in a single statement, which Postgres refuses.
      const unique = new Map<string, BusyEvent>();
      for (const event of future) unique.set(`${event.uid} ${event.start}`, event);

      await upsertBlocks(source.platform, [...unique.values()], runStamp);
      await patchSource(source.id, {
        last_sync_at: runStamp,
        last_sync_status: 'ok',
        last_error: null,
      });

      reports.push({
        id: source.id,
        platform: source.platform,
        status: 'ok',
        events: unique.size,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      platformHealth.set(source.platform, false);

      // Deliberately no delete on this path: last good data stays.
      await patchSource(source.id, {
        last_sync_at: runStamp,
        last_sync_status: 'error',
        last_error: message.slice(0, 500),
      }).catch(() => undefined);

      console.error(`[sync-ical] ${source.platform} ${source.id} failed: ${message}`);
      reports.push({ id: source.id, platform: source.platform, status: 'error', error: message });
    }
  }

  // Reconcile: rows that were not seen in this run no longer exist upstream, so
  // the stay was cancelled or moved. Only for platforms where every source was
  // healthy this run.
  const reconciled: Platform[] = [];
  for (const [platform, healthy] of platformHealth) {
    if (!healthy) continue;
    await rest(
      `external_blocks?platform=eq.${platform}&last_seen_at=lt.${encodeURIComponent(runStamp)}`,
      { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
    );
    reconciled.push(platform);
  }

  return { ok: true, ranAt: runStamp, sources: reports, reconciled };
}

/* -------------------------------------------------------------------------- */

/** Env var first, database fallback second. Empty means "no way to authenticate". */
async function expectedSecret(): Promise<string> {
  if (SYNC_SECRET !== '') return SYNC_SECRET;

  try {
    const rows = (await (
      await rest('sync_config?select=value&key=eq.sync_secret&limit=1')
    ).json()) as Array<{ value: string }>;
    return rows[0]?.value ?? '';
  } catch (error) {
    console.error('[sync-ical] could not read the stored secret', error);
    return '';
  }
}

function secretMatches(candidate: string, expected: string): boolean {
  if (expected === '' || candidate.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < candidate.length; index += 1) {
    diff |= candidate.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return diff === 0;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  if (SUPABASE_URL === '' || SERVICE_ROLE_KEY === '') {
    console.error('[sync-ical] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
    return json({ error: 'not_configured' }, 500);
  }

  // No secret configured means no way to authenticate the caller: refuse.
  const expected = await expectedSecret();
  if (expected === '') {
    console.error('[sync-ical] no SYNC_SECRET and no sync_config row, refusing every call');
    return json({ error: 'not_configured' }, 500);
  }

  if (!secretMatches(request.headers.get('x-sync-secret') ?? '', expected)) {
    return json({ error: 'unauthorized' }, 401);
  }

  try {
    return json(await run(), 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[sync-ical] run failed', message);
    return json({ ok: false, error: message }, 500);
  }
});
