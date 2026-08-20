# Implementation Plan: Obordeleau.fr

**Branch**: `001-obordeleau-site` | **Date**: 2026-08-20 | **Spec**: `./spec.md`

## Summary

A static-first, multilingual (FR/EN/DE) brochure site for a 3-star holiday studio at Les Sablettes, built to
push bookings to Direct while linking Airbnb and Booking. Phase 1 is a fast, SEO-optimized marketing site with
curated + full reviews, a consent-gated branded Google map, and a Direct inquiry form. Phase 2 adds a
collision-safe Direct online-payment engine (iCal sync + Stripe + buffers), parked until owner decisions land.

## Technical Context

**Language/Version**: TypeScript, Node 20+.

**Framework**: Next.js (App Router) with static generation for Phase 1 pages; server routes reserved for the
inquiry endpoint (Phase 1) and the booking engine (Phase 2).

**Styling**: Tailwind CSS + a small design-token layer. transitions-dev `_root.css` motion tokens imported once;
transition snippets pasted verbatim per the skill's output rules (keep `will-change`, keep reduced-motion guards).

**i18n**: `next-intl` (or the App Router built-in i18n routing) with locales `fr` (default, unprefixed), `en`,
`de`. Message catalogs per locale. `hreflang` + canonical emitted per page. FR fallback for any missing key.

**Content/data**: JSON + MDX under `content/`. Reviews from `content/reviews.json` (the provided 165). Copy in
per-locale message files. No copy hardcoded in components.

**Map**: Google Maps JavaScript API, Vector map with a Map ID + cloud styling (brand colors), Advanced Marker in
brand color. Loaded lazily and only after consent. Env: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`,
`NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`. Key restricted to the domain and to Maps JavaScript API; a hard daily quota
(~300/day) keeps usage under the 10,000/month free cap so cost stays 0 EUR. Only the Dynamic Maps SKU is used
(no Places/Geocoding/Directions widgets).

**Analytics**: Vercel Web Analytics (cookieless). Track outbound clicks to Airbnb/Booking and inquiry submits as
events so Direct-vs-channel share (SC-005) is measurable. Optional Vercel Speed Insights.

**Inquiry email (Phase 1)**: a Next.js route handler posting to a transactional email API (Resend free tier
recommended; env `RESEND_API_KEY`, `INQUIRY_TO_EMAIL`). Honeypot + basic rate limit. No DB needed in Phase 1.

**Hosting/DNS**: Vercel. Domain at Hostinger, DNS pointed to Vercel, HTTPS auto.

**Consent**: lightweight, self-hosted consent gate (no third-party CMP) controlling only the map. Analytics is
cookieless and needs no consent for itself.

**Testing**: Playwright for the P1 user journeys and accessibility checks; a CI lint that fails the build on any
em dash / double hyphen in visitor-facing copy (SC-008); Lighthouse CI budget for CWV (SC-002).

**Target Platform**: modern mobile and desktop browsers.

**Project Type**: web (frontend-first, with minimal serverless routes).

**Performance Goals**: green CWV on mobile (LCP < 2.5s, CLS < 0.1, INP < 200ms).

**Constraints**: 0 EUR running cost target; RGPD-clean; WCAG 2.2 AA; no em dash in copy.

**Scale/Scope**: single property, 3 locales, about 6 homepage sections + reviews page + legal pages.

## Constitution Check

- I Intent before implementation: satisfied (spec.md precedes this plan; open items marked NEEDS CLARIFICATION). PASS
- II Content/data separated: satisfied (content/ + message catalogs). PASS
- III i18n first-class: satisfied (fr/en/de, hreflang, native translations). PASS
- IV Performance: satisfied (static-first, lazy media, deferred third parties). PASS
- V Accessibility: satisfied (semantic HTML, reduced-motion guards preserved). PASS
- VI Privacy: satisfied (consent-gated map, cookieless analytics, local avatars). PASS
- VII Copy voice: satisfied (voice rules + em-dash lint in CI). PASS
- VIII Phased, no half-built money path: satisfied (Phase 2 parked, collision-safe requirements). PASS
- IX SEO: satisfied (metadata, structured data, sitemap in "done"). PASS
- X Boring stack: satisfied (Next.js + Tailwind + Vercel). PASS

No violations to justify.

## Project Structure

### Repository layout (target)

```text
obordeleau/
  content/
    property.json          # facts, amenities, distances, channel URLs
    host.json              # first-person bio blocks (validated by owner)
    reviews.json           # the 165 reviews (curated flag on selected ones)
    copy/                  # MDX/long-form copy blocks if needed
  messages/
    fr.json                # default locale strings + metadata + keywords
    en.json
    de.json
  public/
    images/
      hero/                # hero image(s)
      gallery/             # property gallery photos
      host/                # portrait for the About section (optional)
      area/                # beach, park, shuttle boat, surroundings
      reviews/             # guest avatars, 001.jpg ... 165.jpg (owner uploads)
      brand/               # generated wordmark, favicon, og-image
    IMAGE-MANIFEST.md      # exact filename -> slot mapping (see below)
  src/
    app/
      [locale]/
        page.tsx           # homepage (all P1 sections)
        avis/page.tsx      # reviews (fr) ; localized route segments per locale
        mentions-legales/page.tsx
        confidentialite/page.tsx
      api/
        inquiry/route.ts   # Phase 1 Direct inquiry -> email
        # Phase 2 (parked): ical/route.ts, cron/sync/route.ts, checkout/route.ts, webhook/route.ts
    components/
      Hero.tsx Gallery.tsx Amenities.tsx About.tsx
      Reviews.tsx RatingBadge.tsx MapSection.tsx ConsentGate.tsx
      Reservation.tsx InquiryForm.tsx LanguageSwitcher.tsx Wordmark.tsx
    styles/
      _root.css            # transitions-dev motion tokens (imported once)
      tokens.css           # brand palette + type scale
    lib/
      i18n.ts seo.ts structured-data.ts analytics.ts
  tests/
    e2e/ (Playwright)  a11y/  lint/no-emdash.mjs
```

**Structure Decision**: single Next.js app (frontend-first). Serverless routes are limited to the inquiry
endpoint in Phase 1; the Phase 2 booking routes are stubbed as parked and excluded from the Phase 1 build.

## Design system notes

- Palette: background cream `#FAF7F2`; accents `#FF9B54` (sunset orange), `#F25C54` (coral), `#CE4257`
  (raspberry, use sparingly for emphasis/CTAs). Derived ink/dark for text and footer:
  proposed `#3A2A26` (warm near-black) for text and `#2A1E1B` for footer; validate contrast AA on cream.
- Type: serif display for headings (e.g. a transitional/Didone-style serif), humanist sans for body. Final
  families chosen at build for licensing + performance (self-hosted, `font-display: swap`).
- Signature motif: one italic-accent word per major heading (borrowed from the reference's form).
- transitions-dev mapping (apply verbatim, keep reduced-motion): hero copy -> texts-reveal; gallery cards ->
  card hover tilt; amenities/FAQ -> accordion; language/section pills -> tabs sliding; inquiry success ->
  success check (+ icon swap from spinner); nav dropdown/menu -> menu dropdown; any modal (lightbox) -> modal.

## Image manifest (tell the owner exactly where to upload)

- Property photos: `public/images/gallery/` as `gallery-01.jpg` .. `gallery-10.jpg` (plus `hero/hero-01.jpg`).
- Optional host portrait: `public/images/host/corine.jpg`.
- Area/context shots (beach, park, shuttle boat): `public/images/area/` (e.g. `beach.jpg`, `park.jpg`, `boat.jpg`).
- Guest review avatars: `public/images/reviews/` named `001.jpg` .. `165.jpg`, matching `image_filename` in
  `reviews.json`. Two entries have no custom photo (ids 029, 081): leave them absent, the UI renders initials.
- `IMAGE-MANIFEST.md` documents each slot so re-shoots can be dropped in without code changes.

## Phasing

- **Phase 1 (build now)**: all sections, reviews (curated + full page), i18n FR/EN/DE, SEO + structured data,
  consent-gated branded Google map, Direct inquiry form, analytics, legal pages (with placeholders), wordmark +
  favicon, CWV + a11y + em-dash lint gates. Deployable and valuable on its own.
- **Phase 2 (parked, specified in spec.md FR-101..FR-110)**: availability store (Supabase Postgres), Vercel Cron
  polling Airbnb + Booking iCal, our published `.ics`, Stripe Checkout + webhook, buffer + minimum-advance-notice,
  fail-closed checks. Gated on owner decisions: rate grid, payment terms, Stripe entity, cancellation policy,
  Booking iCal confirmation.

## Phase 2 architecture (reference, do not build yet)

Source of truth = Supabase. Cron (~15 min) imports Airbnb/Booking `.ics` and writes blocked ranges. Checkout
re-fetches live feeds + internal store, fails closed on error, enforces min-notice + buffer, then opens Stripe
Checkout. Webhook (`checkout.session.completed`, idempotent) writes the booking and regenerates our public
`.ics` route which Airbnb and Booking re-import. Residual lag risk is mitigated, not eliminated, by the buffer +
min-notice (documented limitation, accepted by owner).

Env for Phase 2: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`AIRBNB_ICAL_URL`, `BOOKING_ICAL_URL`, `PUBLIC_ICAL_TOKEN`.

## Environment variables (summary)

Phase 1: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`, `RESEND_API_KEY`,
`INQUIRY_TO_EMAIL`. Phase 2 adds the block above.

## Complexity Tracking

No constitution violations require justification. The only accepted, documented risk is Phase 2 iCal propagation
lag, mitigated by buffer + minimum advance notice and fail-closed checks (constitution VIII), not by adding a
paid channel manager (rejected to keep 0 EUR running cost per the owner's constraint).
