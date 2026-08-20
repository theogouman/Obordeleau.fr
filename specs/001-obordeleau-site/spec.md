# Feature Specification: Obordeleau.fr, site vitrine + reservation multicanal

**Feature Branch**: `001-obordeleau-site`

**Created**: 2026-08-20

**Status**: Draft (Phase 1 ready to plan; Phase 2 specified but parked)

**Input**: Direct-booking website for a 3-star classified holiday studio ("Obordeleau"),
Les Sablettes, La Seyne-sur-Mer. Goal: maximize DIRECT bookings while still offering
Airbnb and Booking as channels. Multilingual FR/EN/DE, strong local SEO, brochure-grade
design inspired by summersophiastudio.com (structure, not colors), motion via the
transitions-dev skill.

---

## Property facts (source data, confirmed)

- Public name: **Obordeleau** (classified "meuble de tourisme 3 etoiles").
- Host (first person on site): **Corine**.
- Address: 253 Av. Jean-Baptiste Mattei, 83500 La Seyne-sur-Mer.
- GPS: 43.080140, 5.896633.
- Capacity: 4 (best for a couple or a small family; real bed + sofa bed; travel cot on request).
- Size: 35 m2, air-conditioned studio, private garden view, no facing neighbours, secured residence.
- Distance to Les Sablettes sandy beach: about 70 m, reachable on foot through the park.
- Airbnb: https://www.airbnb.fr/rooms/53950636
- Booking: https://www.booking.com/hotel/fr/3-etoiles-au-bord-de-l-eau.html
- Reviews source: one-time export, 165 reviews, average about 4.9/5 (see `content/reviews.json`).

## Proof pillars (mined from the 165 reviews, ordered by frequency)

Use these to prioritize copy and section emphasis. Property and location first, host in support.

1. Everything on foot, no car needed: beach about 2 min through the park, restaurants, shops, market.
2. The Toulon shuttle boat (bateau-bus) at the foot of the residence: Toulon, the bay, the islands.
3. Spotless cleanliness (recurring, near-universal).
4. Clever, functional layout, plenty of storage, "nothing is missing", feels like home.
5. Calm, private garden view, no facing neighbours, central yet quiet.
6. Air conditioning (real plus in summer).
7. Tasteful, cosy, bright decor; the seaside park (turtles, frogs, fitness trail) is loved by families.
8. Secured residence (badge, camera) and free parking across the street.
9. Host (support role): responsive, flexible on arrival/departure, thoughtful welcome touches, linens and towels provided.

Honest calibration (for reassuring, non-overselling copy): compact studio (ideal for 2, workable for
a family of 4 with the sofa bed), one guest found it a bit dark, the main bed has a wall at each end
(tall guests), mosquitoes near the park in summer.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discover, get reassured, reach a booking channel (Priority: P1, Phase 1)

A traveller lands on the site (often from Google or an Airbnb/Booking profile link), understands within
seconds what the place is and why its location is special, browses photos and amenities, reads a few
reviews, sees exactly where it is on a map, and reaches a way to book: Direct (preferred), Airbnb, or
Booking. Direct booking in Phase 1 is an inquiry form (desired dates + message) that emails the host.

**Why this priority**: This is the core of the product and the whole business goal (shift bookings to
Direct). It delivers value even if nothing else is built.

**Independent Test**: Deploy only this story. A visitor on mobile and desktop can read the full pitch,
view the gallery, see the map, and either submit a Direct inquiry or click through to Airbnb/Booking.
Measured complete when a test inquiry reaches the host inbox and both channel links open the right listings.

**Acceptance Scenarios**:

1. **Given** a first-time visitor on mobile, **When** the homepage loads, **Then** the hero states the core
   promise (seaside studio, beach on foot, no car needed) with a visible primary "Reserver" call to action.
2. **Given** a visitor scrolling the homepage, **When** they reach the reservation section, **Then** three
   channels are presented with Direct visually prioritized, and Airbnb/Booking open the correct external listings.
3. **Given** a visitor who chooses Direct, **When** they submit desired dates and a message, **Then** the
   inquiry is delivered to the host and the visitor sees a clear confirmation state.
4. **Given** a visitor, **When** they open the map section, **Then** the exact location is shown with a
   branded marker, only after they accept (consent-gated), with no layout shift.

---

### User Story 2 - Social proof through reviews (Priority: P2, Phase 1)

A hesitant traveller wants proof. The homepage shows a rating badge (about 4.9, 165 reviews) and a curated
set of the strongest, location-focused reviews. A dedicated reviews page lists all 165 with reviewer first
name, month/year, and avatar.

**Why this priority**: Reviews are the single biggest conversion lever for an unknown direct site; they
transfer the trust already earned on Airbnb.

**Independent Test**: The homepage renders the badge and curated reviews; `/avis` (and `/en/reviews`,
`/de/bewertungen`) renders all 165 from `content/reviews.json` with working avatar images and graceful
fallback for the 2 default-avatar entries.

**Acceptance Scenarios**:

1. **Given** the homepage, **When** it loads, **Then** a rating badge and at least 3 curated reviews appear,
   chosen for location/property emphasis.
2. **Given** the reviews page, **When** it loads, **Then** all reviews are listed with first name, date, star
   rating, text, and avatar (initials fallback when no photo).
3. **Given** a review originally in German or English, **When** shown, **Then** it renders in its original
   language (reviews are not machine-retranslated).

---

### User Story 3 - Multilingual reach and local SEO (Priority: P3, Phase 1)

French, English, and German travellers find the site in their language via search, and can switch language
at any time. Content, metadata, and URLs are localized; German and English read natively.

**Why this priority**: German and English guests are a proven, recurring segment in the reviews; capturing
them in their language directly grows demand and direct bookings.

**Independent Test**: `/`, `/en`, `/de` each render fully localized content and metadata, `hreflang` is
correct, the language switcher preserves the current page, and target keywords appear in H1/title/meta per
language (see `seo-keywords.md`).

**Acceptance Scenarios**:

1. **Given** any page, **When** the visitor switches language, **Then** they land on the same page in the new
   language with a localized URL.
2. **Given** a search engine crawler, **When** it fetches a page, **Then** it finds a localized title, meta
   description, canonical, `hreflang` alternates, and `VacationRental`/`LodgingBusiness` structured data.

---

### User Story 4 - Direct online booking with instant payment (Priority: P1 within Phase 2, PARKED)

A traveller selects dates, sees a live price, and pays online instantly for a Direct booking. Availability is
kept collision-safe against Airbnb and Booking via iCal sync, with buffers and minimum advance notice.

**Why this priority**: This is the ultimate goal (capture Direct revenue with zero channel commission), but
it depends on decisions still pending with the owner (payment terms, Stripe entity, cancellation policy) and
must not ship until collision-safe.

**Independent Test**: On a staging environment, a booking for free dates completes payment and writes a
reservation; the same dates then become blocked in our published `.ics`; a booking attempt for dates blocked
on Airbnb/Booking is refused at checkout.

**Acceptance Scenarios**:

1. **Given** free dates respecting the minimum advance notice, **When** the traveller pays, **Then** a booking
   is recorded, a confirmation is shown and emailed, and our published calendar blocks those nights.
2. **Given** dates already booked on Airbnb or Booking within the last successful sync, **When** the traveller
   reaches checkout, **Then** the system refuses and explains the dates are unavailable.
3. **Given** a same-day or near-term request inside the minimum-notice buffer, **When** the traveller tries to
   book Direct, **Then** the system blocks instant payment and offers the inquiry form instead.

### Edge Cases

- Inquiry form: bot spam (honeypot + rate limit), invalid or reversed date range, no dates given.
- Map: visitor declines consent (show a static placeholder with address + "open in Maps" link, never break layout).
- Reviews: default-avatar entries; very long reviews (clamp with "read more"); mixed-language list.
- i18n: a string missing a translation must fall back to French, never render a key or blank.
- Images: a missing photo must not break layout (defined aspect-ratio placeholders).
- Phase 2: iCal feed temporarily unreachable (fail closed: treat as unavailable rather than oversell);
  Stripe webhook ret/duplicate delivery (idempotency); payment succeeds but write fails (reconcile).

---

## Requirements *(mandatory)*

### Functional Requirements, Phase 1

Site and content
- **FR-001**: The site MUST present these homepage sections in order: hero, gallery, amenities/details,
  about the host (first person), reviews (curated) with rating badge, location map, reservation (3 channels).
- **FR-002**: All property, host, amenity, and copy content MUST be sourced from editable data/content files,
  not hardcoded.
- **FR-003**: The gallery MUST display the property photos from the image folder and degrade gracefully when a
  photo is missing.
- **FR-004**: The site MUST reproduce the reference's STRUCTURE and FORM (arched hero, stat/quick-facts bar,
  captioned feature cards, "around you" distances block, italic-accent word in headings) using the project's
  own warm palette, NOT the reference's colors.

Navigation and language
- **FR-005**: The site MUST offer FR (default, `/`), EN (`/en`), DE (`/de`) with a language switcher that
  preserves the current page.
- **FR-006**: Every page MUST emit correct `hreflang` alternates and a self-referencing canonical.
- **FR-007**: EN and DE content MUST be translated to read natively; reviews are the exception and keep their
  original language.

Reviews
- **FR-008**: The homepage MUST show a rating badge (about 4.9, 165 reviews) and a curated subset emphasizing
  location and property.
- **FR-009**: A dedicated reviews page MUST list all 165 reviews with first name, month/year, star rating,
  text, and avatar, with an initials fallback.
- **FR-010**: Reviewer avatars MUST be served from local project assets, not hotlinked from third parties.

Location map
- **FR-011**: The map MUST auto-center on the property with a branded marker and brand-colored styling.
- **FR-012**: The map MUST NOT load any third-party map resource before explicit user consent; a static,
  no-cookie placeholder with the address MUST be shown until then.

Reservation, Phase 1
- **FR-013**: The reservation section MUST present Direct, Airbnb, and Booking, with Direct visually prioritized.
- **FR-014**: Airbnb and Booking MUST link to the exact listings (URLs in Property facts).
- **FR-015**: Direct in Phase 1 MUST be an inquiry form capturing desired arrival/departure and a message, with
  spam protection, that emails the host and shows a success state. It MUST NOT take payment in Phase 1.

Copy and brand
- **FR-016**: All visitor-facing copy MUST follow the voice principle and MUST NOT contain any em dash or
  double hyphen, in any language.
- **FR-017**: Headings MUST use a serif display face; body MUST use a sans face. Background is cream #FAF7F2.
  Accent palette: #FF9B54, #CE4257, #F25C54. A dark tone for footer/text is derived and documented in the plan.
- **FR-018**: A wordmark for "Obordeleau" and a favicon MUST be generated (no existing logo).

Quality gates
- **FR-019**: Pages MUST meet Core Web Vitals targets on mobile (see constitution IV).
- **FR-020**: The site MUST meet WCAG 2.2 AA and honor `prefers-reduced-motion` on all animations.
- **FR-021**: Analytics MUST be cookieless and require no consent banner for themselves.
- **FR-022**: The site MUST expose a sitemap, robots rules, and `VacationRental`/`LodgingBusiness` structured
  data including the 3-star classification, geo, and aggregate rating.
- **FR-023**: Legal pages (mentions legales, politique de confidentialite) MUST exist; their legal identity
  fields are `[NEEDS CLARIFICATION: host legal identity, status, SIRET if any, hosting provider]`.

### Functional Requirements, Phase 2 (PARKED, specified for forward-compatibility)

- **FR-101**: The system MUST keep an internal availability store as the single source of truth for Direct bookings.
- **FR-102**: The system MUST import the Airbnb and Booking iCal feeds on a schedule and block those dates.
- **FR-103**: The system MUST publish its own iCal feed (Direct bookings + manual blocks) for Airbnb and Booking
  to import.
- **FR-104**: At checkout the system MUST re-check the latest external feeds and the internal store before
  creating a payment session, and MUST fail closed if a feed is unreachable.
- **FR-105**: The system MUST enforce a minimum advance notice and a preparation-time buffer around every booking
  to absorb iCal propagation lag.
- **FR-106**: The system MUST collect payment via a hosted payment page and confirm bookings only on a verified
  payment event, with idempotent handling of duplicate events.
- **FR-107**: Pricing MUST be data-driven (per-season nightly rate, minimum nights, cleaning fee) `[NEEDS
  CLARIFICATION: full rate grid]`.
- **FR-108**: Payment terms `[NEEDS CLARIFICATION: full amount vs deposit + balance, security deposit hold,
  tourist tax collection]` and the Stripe entity `[NEEDS CLARIFICATION: individual vs registered business + IBAN]`
  MUST be resolved before enabling this feature.
- **FR-109**: A cancellation policy `[NEEDS CLARIFICATION: flexible / moderate / strict]` MUST be defined and
  surfaced as terms before taking payment.
- **FR-110**: Booking iCal availability on the platform side `[NEEDS CLARIFICATION: confirm Booking export iCal
  is enabled]`.

### Key Entities

- **Property**: name, classification (3-star), address, geo, size, capacity, amenities, distances, photos.
- **Host**: display first name, first-person bio, welcome touches, contact routing for inquiries.
- **Review**: id, reviewer first name, rating, month/year, text, original language, avatar asset, curated flag.
- **BookingChannel**: type (direct/airbnb/booking), URL, priority.
- **InquiryRequest** (Phase 1): arrival, departure, party size, message, contact, timestamp.
- **Localized content**: per-language strings for all copy, metadata, and keywords.
- Phase 2: **Availability** (date -> status/source), **PricingRule** (season, nightly, min-nights, fees),
  **Booking** (dates, guest, amount, status, payment ref), **ICalFeed** (source URL, last-sync, blocked ranges),
  **Payment** (provider ref, amount, status).

## Success Criteria *(mandatory)*

- **SC-001**: A first-time mobile visitor can understand the offer and reach a booking channel within 30 seconds.
- **SC-002**: Green Core Web Vitals on mobile (LCP < 2.5s, CLS < 0.1, INP < 200ms) on the homepage.
- **SC-003**: FR, EN, DE are fully complete with correct `hreflang`; no untranslated strings render.
- **SC-004**: All 165 reviews are accessible on the reviews page; the homepage shows the rating badge and curated set.
- **SC-005**: The share of booking-intent clicks going to Direct (inquiry submit + direct clicks) is measurable in
  analytics and is the largest of the three channels within 3 months.
- **SC-006**: The site ranks on page 1 for the primary local query cluster within 6 months (see seo-keywords.md),
  measured for FR first, then EN/DE.
- **SC-007**: Running cost stays at 0 EUR/month at expected traffic (map under free cap with a hard quota, cookieless
  analytics, static hosting).
- **SC-008**: Zero visitor-facing em dashes across all languages (automated lint in CI).
- **SC-009 (Phase 2)**: Zero double bookings attributable to the Direct engine over the first season, given buffers
  and minimum notice.

## Assumptions

- Hosting on Vercel; domain registered at Hostinger with DNS pointed to Vercel; HTTPS enforced.
- About 10 real property photos initially (to be reshot later); placeholders used until then.
- 165 reviewer avatars are provided by the owner and uploaded to the repo (no scraping/downloading needed).
- Google Maps is the chosen map, with a domain-restricted key and a hard quota so cost is effectively 0 EUR;
  the owner creates the Google Cloud billing account and key.
- Analytics via Vercel Web Analytics (cookieless).
- Inquiry form email delivery via a transactional email service on a free tier (provider chosen in the plan).
- Phase 2 booking model is: instant online payment + bidirectional iCal + buffer + minimum advance notice.
- Copy is drafted by the assistant in French, benefit-oriented, then translated to EN/DE natively; owner validates.
