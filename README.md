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
src/app/          [locale] pages, api/{availability,stay,quote,reservations,calendar},
                  sitemap, robots, icon
src/app/admin/    the owner's console: page, login, server actions
src/components/   presentation, one file per section
src/components/admin/  the console, French only, not a visitor surface
src/i18n/         routing (locales and localized paths), request config, navigation
src/lib/          content, reviews, seo, structured-data, analytics, assets,
                  dates, calendar, money, stay, supabase, availability, pricing,
                  ical, admin-session, admin-auth, admin-data, admin-forms
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

**Signing in.** One password, held in `ADMIN_PASSWORD`, and no account, no
address and no identity provider: there is one person who opens this console
and she knows who she is. The submitted password and the variable are both
hashed to SHA-256 and compared with `timingSafeEqual`, so the comparison is
always over 32 bytes and gives away neither the answer nor its length. An empty
submission is refused before anything is compared, and so is every submission
when the variable is unset: an admin that is open by accident is worse than an
admin that is shut.

What an identity provider used to give for free was the rate limiting, so that
is written here instead, and it lives in `admin_login_attempts` rather than in
memory. Vercel runs many instances of the same function, so an in memory
counter is bypassed by retrying until you land on a fresh one. Five wrong
answers from one address inside a quarter of an hour lock it for the next
quarter of an hour, and every wrong answer also costs a short delay that grows
with the count, which slows a guesser who arrives from a different address each
time. If the store cannot be reached the door is refused rather than left
unguarded, which costs nothing: the console cannot do anything useful without
it anyway.

A correct password becomes a short HMAC signed cookie, so later requests are
answered without repeating the check. Three layers, and only the last two are
load bearing:

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

### Setting up the password

Two variables in Vercel, and nothing to create anywhere:

```sh
openssl rand -base64 24   # ADMIN_PASSWORD, or a passphrase you will remember
openssl rand -base64 48   # ADMIN_SESSION_SECRET, at least 32 characters
```

They are different secrets and neither is reused elsewhere. **Set them, then
redeploy**: Vercel gives a deployment the environment it had when it was built,
so a variable added afterwards does not reach the build that is already live.
Until both are set the console shows why rather than a form, and refuses to
sign anyone in.

The console is French only and is not a visitor surface, so next-intl never
touches it: every string in it is written where it is used.

Changing the password is one environment variable and a redeploy. It does not
invalidate sessions already signed, since the cookie says the check passed
rather than what it passed with; rotating `ADMIN_SESSION_SECRET` is what signs
everyone out.

### Tests

`supabase/tests/pricing-admin.test.sql` covers the nineteen cases behind the
console: the settings read, the calendar rows and what is holding each night,
override writes skipping booked nights, clearing back to the automatic price,
each refusal by name, and an override still winning inside an exempt season.

```sh
npm run test:sql        # both suites; needs SUPABASE_DB_URL and psql
```

## Phase 3 lot 3, the visitor's quote

The booking card already asked one question at a time. This lot taught it the
stay rules, asked who is under 18, and put a price on the recap.

**The picker guides, the server rules.** `src/lib/stay.ts` is a deliberate
mirror of `validate_stay`, and it exists for one reason: a grid cannot ask the
server about every square. It greys out a Tuesday in July and every checkout
that is not a whole number of weeks. Then the answer that counts:

```text
  the grid        mirror of the rule      greys out what would be refused
  /api/stay       validate_stay           confirms before the flow moves on
  the write path  validate_stay again     settles it, under the exclusion constraint
```

`create_direct_reservation` used to check "at least one night" and "not before
tomorrow" itself, which was the whole rule when it was written and is a fragment
of it now. It calls `validate_stay` instead, so **two nights in February and a
Tuesday arrival in July are refused by the write path too**, and the refusal
comes back named rather than as a blanket "unavailable".

**Who is under 18.** The tourist tax is charged per adult, so the split is part
of the stay. The question only appears from two travellers up, because with one
there is nobody for it to be about, and minors are capped at one below the party
size: a stay with no adult in it cannot be quoted and cannot be let. The number
is stored on the reservation, since a booking taken before the payment lot would
otherwise lose the one figure needed to work out what it owes.

**The quote.** `POST /api/quote` validates the stay, then returns `get_quote`'s
own fields. Not one figure is added up in the browser, and the request carries
dates and people, never money: the amount charged in lot 4 comes from the same
function, server side, so the two cannot drift. Cleaning at zero is not a zero
on a line, it reads **Offert**, because a nought next to "ménage" looks like a
missing price rather than a gift.

The panel is additive. When no price can be produced, because the owner has not
set a rate yet, it stays away and the flow is exactly what it was before this
lot: the stay is recorded and the amount is confirmed by email.

**Without JavaScript** the card is a calendar that cannot be paged and a button
that cannot be pressed, so `Reservation.tsx` takes it out of the page and puts a
plain one in its place: why, and three ways to reach the host. It sits in the
server component on purpose, because React reconciling `noscript` children on
the client is a known way to produce a hydration mismatch.

### Tests

`supabase/tests/stay-rules.test.sql` covers the thirteen cases underneath:
what `public_stay_rules` hands the picker and that it carries no price, each
refusal the write path now makes by name, the minors stored with the stay, and
the tax falling on the adults alone.

## Phase 3 lot 4, the deposit

The visitor now pays half the accommodation to book, and the card that paid it
can be kept for the balance. Two things make that safe.

**The nights are taken before Stripe is called.** In instant booking with a
deposit, two visitors can reach a card form for the same week at the same
moment. Confirming only on the payment webhook would let both cards clear, and
the second write would then fail on the exclusion constraint: a deposit taken
for a week that cannot be honoured. So `create_direct_reservation` gained one
argument, a hold lifetime, and the exclusion constraint was widened to cover
holds:

```text
  status in ('confirmed','hold')   one exclusion constraint, both states
        │
        ├── hold      25 minutes, taken at the top of the checkout
        └── confirmed the deposit cleared, or the enquiry path wrote it outright
```

The second checkout on the same week is refused by the same mechanism that
already settled two simultaneous bookings, before a single euro moves. Called
without a lifetime the function still writes a confirmed booking, which is why
the Phase 2 enquiry route did not have to be touched.

A hold that is abandoned has to stop blocking, and an index predicate cannot
expire anything on its own because it has to be immutable and `now()` is not.
Expiry is a sweep: `expire_stale_holds()` runs at the top of every write and
every five minutes by cron. Reads count an expired but unswept hold as busy, on
purpose, because that is the answer the constraint would give, so the picker is
never kinder than the write path.

**The amount is never sent up from the browser.** `POST /api/checkout`
revalidates the stay with `validate_stay`, checks the party against the
capacity, recomputes the quote with `get_quote`, holds the nights, and only then
opens a payment intent for `deposit_amount`. The browser sends dates and people.
A total posted up from it would be ignored, because none is read.

**The conversion happens once.** The webhook and the browser both report a
successful card, and Stripe replays webhooks. Both call
`confirm_reservation_payment`, which locks the payment row: the first caller
gets `converted: true` and sends the emails, every later one is told the work
was already done. One booking, one letter, however many times the news arrives.

**When it goes wrong.** A card refused leaves the hold standing, so another can
be tried inside its lifetime. A deposit that clears for a week whose hold was
swept and taken by somebody else is refunded automatically at Stripe, the hold
is released, and Corine is told so she can write to the guest. That path should
never run; it is there because the alternative is money with no room behind it.

**The card is kept only if the guest says so.** The opt in is unticked, it names
the amount and the date in the same sentence, and it is what decides whether
`setup_future_usage` is set at all. Without it Stripe never stores a reusable
payment method, `save_card_consent` is false, and the confirmation email says
the balance will be arranged rather than taken. The balance date is
`check_in` minus `deposit_charge_days_before_arrival`, which lives in
`pricing_config`, is seeded to 14 by this lot, and is editable in the console.

`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are server side only, the same
discipline as the service role key. Only `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
reaches the browser, which is what it is for. Without the keys the card step is
not offered at all: the flow falls back to the enquiry it was before this lot,
rather than showing a payment form that cannot take a payment.

### Setting up Stripe

1. Copy the secret key and the publishable key from the Stripe dashboard into
   Vercel.
2. Add a webhook endpoint at `https://www.obordeleau.fr/api/stripe/webhook`,
   subscribed to `payment_intent.succeeded` and `payment_intent.payment_failed`,
   and copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Redeploy. `NEXT_PUBLIC_` variables are inlined at build time, so a key set
   after a build does not reach the page that build produced.

### Tests

`supabase/tests/payments.test.sql` covers the twenty nine cases behind it: a
checkout taking a hold rather than a booking, a second checkout refused before
Stripe, the reads agreeing with the constraint, a returning visitor finding
their own hold, the deposit and the balance splitting the way the quote says,
a refused card leaving the hold alone, the conversion happening exactly once,
the sweep releasing what was abandoned, the deposit that has to go back, the
capacity refused at the table, and the enquiry path still confirming outright.

## Phase 3 lot 5, the balance

The deposit is taken while the visitor is watching. The balance is taken weeks
later, with nobody there, on the card they agreed to leave.

**The database decides when, Stripe only executes.** Stripe schedules nothing on
a calendar date outside a subscription, so a daily pg_cron job at 07:00 posts to
`/api/balances/run`, on exactly the Phase 2 pattern: the shared secret is
generated inside the database, sent in a header, and read back through the
service role. It is in no environment variable, it was never copied by hand, and
rotating it is one update with no deploy. The Stripe secret key stays on Vercel
and never comes near the database.

**What is due** is one query, and the cancellation rule is one line of it:

```text
  status = 'confirmed'          a stay that is off is never charged
  deposit_status = 'paid'       and one that never started is not either
  balance_status = 'pending'    and balance_charge_on has arrived
     or action_required/failed  and the wait is over, and reminders remain
```

**Charged at most once.** A row is claimed before Stripe is asked anything, and
the claim is a column rather than a row lock, because the work happens across an
http round trip and a lock would not survive it. Two runs overlapping cannot
pick the same row; a claim left behind by a runner that died is taken back after
half an hour. On top of that the payment intent carries an idempotency key made
of the stay and the amount, so a run retried within the day replays Stripe's own
answer rather than taking the money twice.

**The amount is read, never rebuilt.** `balance_due` was frozen when the deposit
cleared. `get_quote` is not called again on this path, so a rate the owner
changed in March cannot move a figure a guest agreed to in January.

**When the bank wants the guest.** `authentication_required` is the expected
European answer, not an exotic one, which is why the fallback is part of the
design:

```text
  off session charge  ──▶ succeeded            paid, receipt sent
                      ──▶ authentication_required  ──┐
                      ──▶ refused                 ──┤  a link, emailed
                      ──▶ no card was ever kept   ──┘
```

The link points at this site, not at Stripe. A Checkout session dies within the
day and a guest who opens the email the following evening must not find a dead
link, so `/api/balances/pay/<token>` mints a fresh session at the moment it is
clicked. The token is ours, does not expire, and is cleared the moment the
balance is paid, so a spent link opens nothing.

**Two reminders, then a person.** Three days apart, and the third time the guest
does not answer Corine is told, because at that point it is a telephone call and
not a cron job. A refused card tells her straight away as well. Every attempt is
a row in `balance_charge_attempts`, so a charge that silently did not happen is
visible as an absence rather than being invisible.

**Settled once, whoever hears first.** The runner and the webhook can both learn
that a card cleared, and Stripe replays webhooks. Both call
`settle_balance_payment`, which locks the row: one caller comes back with
`changed: true` and sends the receipt, every later one is told the work was
already done.

The console at `/admin` grew a **Soldes** table underneath the calendar, ordered
by what needs a person rather than by date, plus a button that runs the same
pass immediately. Pressing it twice is safe, for the same reason two cron runs
are.

### Setting up

Nothing to do beyond the lot 4 Stripe keys. Add `checkout.session.completed` to
the webhook endpoint alongside the two payment intent events, so a balance paid
through the fallback link settles itself.

### Tests

`supabase/tests/balance.test.sql` covers the thirty cases behind it: what is
claimed and what is left alone, a cancelled stay never charged, a claim that
holds and a stale one taken back, the SCA path and its waiting period, reminders
counted and then exhausted, the link minted once and spent on payment, the
webhook settling once and a replay settling nothing, a refused card kept with
its reason, the console ordering, and the frozen amount surviving a rate change.

```sh
npm run test:sql        # all five suites; needs SUPABASE_DB_URL and psql
```

## Deploying

Import the repository on Vercel, set the environment variables, point the Hostinger DNS at Vercel.
The build command is the default `npm run build`, which runs the copy lint first, so a stray em dash
fails the deploy rather than reaching a visitor.
