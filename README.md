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
src/components/   presentation, one file per section
src/i18n/         routing (locales and localized paths), request config, navigation
src/lib/          content, reviews, seo, structured-data, analytics, assets,
                  dates, supabase, availability, ical
supabase/         migrations/ (schema), functions/sync-ical/ (the iCal importer)
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

## Deploying

Import the repository on Vercel, set the environment variables, point the Hostinger DNS at Vercel.
The build command is the default `npm run build`, which runs the copy lint first, so a stray em dash
fails the deploy rather than reaching a visitor.
