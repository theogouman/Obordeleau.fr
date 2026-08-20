# Reviews: data mapping and curation

## Data source

Drop the provided 165-review JSON at `content/reviews.json`. Field mapping from the export to the site model:

- `reviewer_name` -> displayed first name only (strip anything after the first token if needed).
- `rating` -> star rating.
- `date` / `date_iso` -> show `date` (month + year); use `date_iso` for sorting (newest first).
- `review_fr` -> review text. Note: despite the field name, some entries are already in EN or DE. Show each review
  in its ORIGINAL language (do not machine-retranslate reviews). Optionally tag detected language for a small flag.
- `image_filename` -> avatar at `public/images/reviews/<image_filename>` (e.g. `033.jpg`).
- `has_custom_photo` false (ids 029, 081) -> render initials fallback, no broken image.

## Display rules

- Full reviews page (`/avis`, `/en/reviews`, `/de/bewertungen`): show ALL 165, newest first, honest and complete
  (including the 4-star and the single 3-star entries). This transparency builds trust.
- Homepage curated block: show only strong, location/property-focused 5-star reviews (list below), 6 to 9 of them.
- Rating badge: "about 4.9 / 5, 165 avis" (compute the exact average from the data at build time).
- Long reviews: clamp to a few lines with a "lire plus" toggle (accordion transition).

## Curated for the homepage (property and location first, host kept light)

Feature these ids (strong on beach-on-foot, shuttle boat, cleanliness, layout, quiet garden, AC):
`003, 010, 016, 033, 042, 057, 059, 061, 070, 080, 108, 128, 143, 149`.

Pick 6 to 9 of these for the homepage grid; keep variety (French, plus a couple of the internationally written ones
like 070, 108, 143 to signal the German/English audience).

## Hero micro-quotes (short, evocative, location-forward)

Use 2 to 3 of these very short lines rotating or stacked in the hero:
- id 115: "les pieds presque dans l'eau"
- id 010: "a 2 pas de la mer, aux abords d'un parc magnifique"
- id 057: "plein de charme, propre, silencieux, et extremement bien place"
- id 033: "a 2 min de la plage des Sablettes ... ideal pour des vacances sans voiture"

Keep hero quotes short and attribute with first name + month/year. No em dash anywhere.
