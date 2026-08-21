# Obordeleau.fr Constitution

Governing principles for the whole project. Every spec, plan, and implementation
decision must be checked against these. When a choice conflicts with a principle,
the principle wins unless the conflict is explicitly justified in the plan's
Complexity Tracking section.

## Core Principles

### I. Intent before implementation
We define the "what" and "why" in `spec.md` before the "how" in `plan.md`, and we
build only from validated specs. Anything under-specified is marked
`[NEEDS CLARIFICATION]` and is never silently guessed. No feature ships from a
one-shot prompt.

### II. Content and data are separated from code
The property, the host, the reviews, the pricing, the amenities, and every string
of copy live in structured data or content files (JSON / MDX), never hardcoded in
components. The owner must be able to change a price, a photo, or a sentence
without touching application logic.

### III. Internationalization is first-class
French is the default language. English, German and Italian are full peers, not
afterthoughts: same content coverage, correct `hreflang`, localized URLs
(`/`, `/en`, `/de`, `/it`), and localized metadata. Translations must read as written by
a native speaker, never as machine output.

### IV. Performance and Core Web Vitals
Static-first rendering. Images optimized and lazy-loaded. Third-party scripts
deferred. Target: green Core Web Vitals on mobile (LCP under 2.5s, CLS under 0.1,
INP under 200ms) on a mid-range phone over 4G.

### V. Accessibility is non-negotiable
WCAG 2.2 AA. Semantic HTML, keyboard navigability, sufficient contrast, alt text
on every image. Every motion effect honors `prefers-reduced-motion` (this is also
a hard requirement of the transitions-dev snippets we use).

### VI. Privacy by default (RGPD)
Data minimization. No third party that sets cookies or phones home loads before
explicit consent. The map is consent-gated. Analytics are cookieless. No personal
data ever travels in a URL. Guest review avatars are re-hosted locally and shown
with first name only.

### VII. Copy voice
Simple, concrete, benefit-oriented, and reassuring for the traveller. The value of
the PROPERTY and its LOCATION comes first; the host is present but in support, not
celebrated as exceptional. First person for the host's own words. Hard rule: never
use the em dash or double hyphen anywhere in visitor-facing copy, in any language.
Use commas, colons, or parentheses instead.

### VIII. Phased delivery, no half-built money paths
Phase 1 (marketing site, reviews, i18n, SEO, and a Direct inquiry form) ships
first and stands on its own. Phase 2 (live online payment + calendar sync) ships
only when it is collision-safe: no code path may take money for dates it cannot
prove are free within the sync constraints, and buffers plus minimum advance
notice are mandatory before it goes live.

### IX. SEO as a build constraint
Semantic structure, one clear H1 per page, localized title and meta description
per page and language, `LodgingBusiness` / `VacationRental` structured data,
sitemap, and clean canonical URLs are part of "done", not a later pass.

### X. Boring, maintainable stack
Conventional, well-documented tools with strong defaults. The site must be cheap
to run (target running cost 0 EUR at this traffic) and simple enough that one
developer can maintain it long-term.

## Governance

This constitution supersedes ad-hoc preferences. `plan.md` must include a
Constitution Check and pass it before implementation. Any violation must be listed
and justified in Complexity Tracking, with the simpler rejected alternative named.
Copy that contains an em dash, a third party that loads before consent, or a Phase
2 payment path without collision safety are automatic blockers.

**Version**: 1.1.0 | **Ratified**: 2026-08-20 | **Last Amended**: 2026-08-22
