# Obordeleau.fr

Direct-booking site for **Obordeleau**, a 3-star classified holiday studio at Les Sablettes,
La Seyne-sur-Mer. French by default, English and German as full peers.

Governing documents, read them before changing anything:

- [constitution.md](constitution.md), the ten principles that override preferences
- [specs/001-obordeleau-site/spec.md](specs/001-obordeleau-site/spec.md), the what and the why
- [specs/001-obordeleau-site/plan.md](specs/001-obordeleau-site/plan.md), the how
- [specs/001-obordeleau-site/reviews-curation.md](specs/001-obordeleau-site/reviews-curation.md)
- [specs/001-obordeleau-site/seo-keywords.md](specs/001-obordeleau-site/seo-keywords.md)

## Stack

Next.js 15 (App Router, static-first) · TypeScript · Tailwind CSS 4 · next-intl 4 · Vercel.

## Getting started

Node 20.11 or newer is required (this machine had no Node runtime when the code was written, so
nothing here has been executed yet, see "Status" below).

```bash
npm install
cp .env.example .env.local   # fill in what you have, the site runs without any of it
npm run dev                  # http://localhost:3000
```

Useful scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Runs the copy lint, then the production build |
| `npm run lint:copy` | Fails on any em dash, en dash or double hyphen in copy (SC-008) |
| `npm run check:reviews` | Validates `content/reviews.json` and lists missing avatars |
| `npm run lint` | ESLint with the Next.js core-web-vitals config |
| `npm run test:e2e` | Playwright journeys and axe accessibility checks |
| `npx @lhci/cli autorun` | Core Web Vitals budget from `lighthouserc.json` |

## Where everything lives

```text
content/          property.json, host.json, reviews.json, reviews-curation.json
messages/         fr.json (source of truth), en.json, de.json
public/images/    hero, gallery, host, area, reviews  (see public/IMAGE-MANIFEST.md)
src/app/          [locale] pages, api/{availability,reservations,calendar}, sitemap, robots, icon
src/app/admin/    the owner's console: page, login, server actions
src/components/   presentation, one file per section
src/components/admin/  the console, French only, not a visitor surface
src/i18n/         routing (locales and localized paths), request config, navigation
src/lib/          content, reviews, seo, structured-data, analytics, assets,
                  dates, calendar, money, supabase, availability, pricing, ical,
                  admin-session, admin-auth, admin-data, admin-forms
supabase/         migrations/ (schema), tests/ (SQL suites),
                  functions/sync-ical/ (the iCal importer)
src/styles/       globals.css (Tailwind theme), tokens.css (brand), _root.css (motion)
scripts/          no-emdash.mjs, check-reviews.mjs
tests/e2e/        journey, reviews, accessibility
```

Nothing visitor facing is hardcoded in a component (constitution II). Facts live in `content/`,
words live in `messages/`. To change a sentence, edit the three catalogues; to change a fact, edit
`content/property.json`.

## URLs

| Page | FR | EN | DE |
| --- | --- | --- | --- |
| Home | `/` | `/en` | `/de` |
| Reviews | `/avis` | `/en/reviews` | `/de/bewertungen` |
| Legal notice | `/mentions-legales` | `/en/legal-notice` | `/de/impressum` |
| Privacy | `/confidentialite` | `/en/privacy` | `/de/datenschutz` |

French is unprefixed, every page emits a self-referencing canonical plus `fr-FR`, `en-GB`, `de-DE`
and `x-default` alternates, and any key missing from a translation falls back to French.

## Environment variables

All of them are optional for local development. The site degrades on purpose rather than breaking.

| Variable | Without it |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical URLs point at `https://www.obordeleau.fr` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | The map section shows the address and an "open in Maps" link |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | The map loads without the brand cloud styling |
| `RESEND_API_KEY`, `INQUIRY_FROM_EMAIL` | In development a booking email is logged to the console; in production the booking is still written, but nobody is notified |
| `BOOKINGS_TO_EMAIL` (falls back to `INQUIRY_TO_EMAIL`) | The host is not told about a new booking |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | The calendar cannot load and no booking can be written: the section falls back to its error state and to the Airbnb and Booking links |
| `ICAL_FEED_TOKEN` | The master `.ics` feed answers 404, so the platforms import nothing |
| `ADMIN_SESSION_SECRET` | The console at `/admin` refuses to sign anyone in, rather than falling back to something weaker |
| `SUPABASE_DB_URL` | `npm run test:sql` has nothing to connect to; the site itself never reads it |

`SUPABASE_SERVICE_ROLE_KEY` bypasses row level security. It is server side only and must never be
given a `NEXT_PUBLIC_` prefix.

Restrict the Maps key to the site domain **and** to the Maps JavaScript API, then set a hard daily
quota of about 300 requests. That keeps the site inside the free tier (SC-007).

## Privacy posture (constitution VI)

- The Google Maps script is never requested before the visitor clicks "Afficher la carte". The
  placeholder is an inline SVG, so declining costs nothing and shifts nothing.
- The consent choice lives in `localStorage` and can be withdrawn from the map section.
- Analytics is Vercel Web Analytics, cookieless, so it needs no banner of its own.
- The inquiry endpoint stores nothing. It formats one email and forgets.
- Reviews show the first name only, and avatars are served from this repository.

## Status

Everything in Phase 1 is implemented, with three inputs still missing from the owner. **No command in
this repository has been run yet**, because the machine the code was written on has no Node runtime.
Expect the usual first-run adjustments (dependency versions, a stray type) on `npm install && npm run build`.

### Blocked on the owner

1. **`content/reviews.json` is an empty array.** The 165 review export was never delivered, and
   inventing reviews was not an option. The rating badge, the curated homepage block, the hero
   quotes, the `Review` structured data and `/avis` all read from this one file and currently render
   their empty states. Drop the export in, run `npm run check:reviews`, and everything lights up with
   no code change. The expected shape is `content/reviews.schema.json`; the curation rules from the
   spec already live in `content/reviews-curation.json`.
2. **Photographs.** Every slot renders a reserved placeholder of the right size until a file appears.
   See [public/IMAGE-MANIFEST.md](public/IMAGE-MANIFEST.md) for the exact filenames.
3. **Legal identity (FR-023).** Name, status, SIRET, registration number and contact email are the
   open `[NEEDS CLARIFICATION]` from the spec. `/mentions-legales` renders a visible "à compléter"
   for each one and is excluded from indexing until they are filled in, in
   `messages/*.json` under `legalPage` and in `robots.ts`.

### Facts still to confirm

`content/property.json` marks a few amenities `"confirmed": false` (wifi, kitchen, washing machine,
TV, terrace, step-free access). They are **not rendered**. The spec never confirmed them and
advertising an amenity that does not exist is worse than omitting it. Flip the flag once Corine
confirms, and check the note text in the three catalogues at the same time.

Distances beyond the beach (shops, restaurants, market) carry no figure, only "on foot", for the
same reason. Add `distanceM` or `walkMinutes` in `content/property.json` when they are known.

### Deviations from plan.md worth knowing

- **transitions-dev snippets.** The skill was not available in the environment where this was built.
  `src/styles/_root.css` provides the same token names and, crucially, the same reduced-motion
  guarantee; the transitions themselves (card tilt, accordion, menu dropdown, modal, success check,
  text reveal) are written by hand against those tokens. When you paste the official snippets in,
  keep the `prefers-reduced-motion` block and keep `will-change` as the skill emits it.
- **Two derived colours.** The spec gives cream plus three accents. On cream, `#CE4257` reaches only
  4.3:1 and `#F25C54` only 3.0:1, both below AA for body text. `#A8253C` (6.6:1) is used for links
  and emphasis text, `#6B5750` (6.3:1) for secondary text. The raw accents stay decorative, and the
  primary button is white on `#CE4257` at 4.6:1. The reasoning is in `src/styles/tokens.css`.
- **The social card is generated**, not designed: `src/app/[locale]/opengraph-image.tsx` renders a
  1200 by 630 PNG per language at build time. If it ever fights the build, deleting that one file
  costs nothing else.
- **Rate limiting is in memory.** Serverless instances get recycled, so the honeypot and the minimum
  fill time do most of the work. That is proportionate for an inquiry form with no payment behind it.
- **ESLint does not gate the build.** `next.config.ts` sets `eslint.ignoreDuringBuilds`, so a style
  rule cannot fail a deploy. Linting stays a first class gate through `npm run lint` and
  `npm run check`. TypeScript checking and the em dash lint both still block the build.

## Phase 2, the booking calendar

The availability store is a Supabase Postgres database (project `Obordeleau`, region `eu-west-1`).
Every range is half open, `[start_date, end_date)`, which is what an exclusive iCal `DTEND` means:
a checkout day is free for the next arrival, everywhere, without conversion.

```text
Airbnb .ics ─┐
Booking .ics ─┤ (rows in ical_sources)
             ▼
      sync-ical Edge Function ──▶ external_blocks ─┐
      (pg_cron every 15 min)                       │
                                manual_blocks ─────┼──▶ busy_ranges()
                     reservations (confirmed) ─────┘        │
                                                            ├──▶ GET /api/availability   (calendar)
                                                            └──▶ GET /api/calendar/<token>.ics
                                                                     ▲
                                                        one URL, pasted into both platforms
```

**The availability rule**, applied in the database and nowhere else: at least one night, arrival no
earlier than tomorrow in Europe/Paris, and no overlap with a confirmed reservation, a manual block
or an imported block. `POST /api/reservations` calls `create_direct_reservation`, which re-applies
the rule and inserts in one statement; an exclusion constraint on `reservations` settles a race, so
two submissions for the same free nights produce exactly one booking and one clean refusal.

**Fail closed.** `sync-ical` deletes a platform's stale blocks only when every active source of
that platform was fetched and parsed in this run. A feed that times out, 500s or answers with an
HTML error page keeps its last good blocks and records `last_error`; it never frees a date.

**Security.** All four tables have RLS on with no policies, so nothing is reachable from a browser;
the three functions are revoked from `anon` and `authenticated`. `sync-ical` requires an
`x-sync-secret` header, whose value is generated inside the database and read from `sync_config` by
both the cron schedule and the function, so it is never copied by hand. The public feed carries a
token in its path and a generic `SUMMARY:Indisponible`, never a guest name.

**Known residual risk.** Airbnb refreshes an imported calendar every few hours, so a direct booking
takes a while to appear there. No same day booking and fail closed imports narrow the window; they
do not close it. A preparation buffer and a configurable minimum stay arrive with the admin step.

### Adding a source

The Airbnb export URL is a row, not an environment variable, so adding Booking later is an insert:

```sql
insert into ical_sources (platform, url) values ('booking', 'https://...');
```

### Not yet built

Payment (Phase 3): the write path stays `confirmed`; it becomes a hold converted on payment by
changing `create_direct_reservation`, not its callers. The admin interface owns manual blocks,
buffers and minimum stay; the tables are already there.

## Phase 3 lot 1, the price engine

Prices live in the same Postgres database as availability, and the site never
computes one. A night resolves by stacking four layers, most specific first:

```text
  price_overrides        a hand set price on one date, wins outright, both ways
        ▲
  last_minute_discount   free nights inside a sliding window, downwards only
        ▲
  seasonal_tiers         a dated tier with its own rate (July and August today)
        ▲
  pricing_config         the base nightly rate
```

`resolve_nightly_prices(from, to)` returns one row per night with the layer that
won, which is what the calendar draws. `get_quote(check_in, check_out, adults,
minors)` is the **only** place a total is ever computed: the figure the visitor
reads and the figure Stripe is later asked to charge come from the same call, so
they cannot drift, and an amount posted up from a browser is never trusted.

**The last minute rule** is evaluated per night and anchored on today at the
property, so the window slides on its own with nothing to recompute on a
schedule. A night is discounted only when the toggle is on, the night is free,
it falls within `window_days` of today, its tier is not marked exempt, no
override sits on it, and the discounted price is genuinely lower. `floor_price`
is the guard rail: a discounted price set under it becomes the floor rather than
being refused.

**Stay rules are validation, not pricing**, and live in their own function.
`validate_stay(check_in, check_out)` answers `{valid, reason}` against the
constraints of every season the dates touch, then against availability on the
Phase 2 mechanism. Outside the tiers: two nights minimum, any arrival day.
July and August: Saturday arrival and a length that is a multiple of seven, with
no upper bound, which puts the departure on a Saturday too. The date picker uses
it to answer early, and it is re-run server side before any payment.

**Money fails closed.** A rate the owner has not set is NULL, never zero and
never a guess, and `get_quote` raises `pricing_not_configured` rather than
quoting a night it cannot price (constitution VIII). Seeded today: cleaning
offered at 0, tourist tax at 1.86 EUR per adult per night (minors under 18 are
exempt, and the rate is a config field because the TPM reindexes it each
January), deposit at 50 percent of the accommodation alone, and the July and
August seasons for 2026 to 2032 with their Saturday to Saturday constraints.
Still to be set by the owner before anything can be quoted:

```sql
update pricing_config set base_nightly_rate = ..., deposit_charge_days_before_arrival = ...;
update seasonal_tiers set nightly_rate = ... where label = 'summer-2027';
update last_minute_discount set window_days = ..., discounted_price = ..., floor_price = ..., enabled = true;
```

Adding a season is an insert, not a deploy. Nothing in any function knows that
summer is special.

### Tests

`supabase/tests/pricing.test.sql` covers the twenty eight acceptance cases in
one transaction that always rolls back, so it can be pointed at any environment
without leaving a row behind. Fixture dates sit in 2029, far outside the
imported calendars, and the last minute window is pinned through the
`p_today` argument rather than by waiting for the calendar, so the suite gives
the same answer whatever day it runs.

```sh
npm run test:sql        # needs SUPABASE_DB_URL and psql
```

## Phase 3 lot 2, the owner's console

`/admin`, French only, one account. It is not a visitor surface, so next-intl
never touches it, it carries `noindex`, and `robots.txt` disallows it.

**Signing in.** The password goes straight to Supabase Auth, which owns the
account, the hashing and the rate limiting. What comes back is turned into a
short HMAC signed cookie so later requests are answered without another round
trip. Three layers, and only the last two are load bearing:

```text
  middleware      is there a session cookie at all?   fast redirect, no secret
  the page        verify the signature, check expiry  redirects if not
  every action    verify again, on its own request    the real gate
```

A server action is its own HTTP request, so it is checked as one: the page
having rendered a form is not evidence about who is posting it. The service
role key only ever reaches the database after that check, which is why the four
pricing tables can keep RLS on with no policy.

**The page has two halves.** Above, the general rules: base rate, cleaning,
tourist tax, deposit, the seasons, and the last minute discount. Below, the
month.

Every figure in the calendar is the resolved price from the lot 1 engine, not a
preview of it, so what the owner reads is what a visitor would be quoted. Each
night carries the layer that won it, in words as well as in colour: `saison`,
`remise`, `manuel`, or nothing for the default rate. That is the guard rail.
The deposit is charged automatically, so the only way to notice that the last
minute rule has become a bad idea is to see what it is doing to next week.

Clicking a night selects it, clicking a second takes the range, and the panel
below sets or clears a manual price. **A booked night is not selectable.** It
still shows its price and says who is holding it, but no manual price can be
posted over a figure already agreed with a guest, and `admin_set_override`
skips such nights server side too, then reports how many it skipped.

**Two conventions are hidden from the person using it.** A season asks for its
last night rather than an exclusive end date, and the calendar sends the half
open range the rest of the project speaks; both conversions happen in the
action and nowhere else. The month is a URL parameter, so paging is an ordinary
navigation the server answers with fresh prices, and a month can be reloaded or
linked to.

**Motion.** Every transition in `src/styles/admin.css` is written on the
`--duration-*` tokens, which `src/styles/_root.css` collapses to 1ms under
`prefers-reduced-motion: reduce`, on top of the blanket rule that cancels
animation and transition durations outright.

### Setting up the account

Create the single admin in the Supabase dashboard, Authentication, Add user,
with a password and email confirmation ticked. Then set `ADMIN_SESSION_SECRET`
in Vercel:

```sh
openssl rand -base64 48
```

### Tests

`supabase/tests/pricing-admin.test.sql` covers the nineteen cases behind the
console: the settings read, the calendar rows and what is holding each night,
override writes skipping booked nights, clearing back to the automatic price,
each refusal by name, and an override still winning inside an exempt season.

```sh
npm run test:sql        # both suites; needs SUPABASE_DB_URL and psql
```

## Deploying

Import the repository on Vercel, set the environment variables, point the Hostinger DNS at Vercel.
The build command is the default `npm run build`, which runs the copy lint first, so a stray em dash
fails the deploy rather than reaching a visitor.
