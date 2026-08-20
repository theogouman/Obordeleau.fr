# Image manifest

Every image slot the site knows about, with the exact filename it expects. Drop a file in with the
right name and it appears, no code change needed. A slot with no file renders a reserved placeholder
of the same size, so a missing photo never shifts the layout.

Formats: JPG or WebP for photos (the build serves AVIF and WebP automatically). Keep the long edge
around 2400 px and the file under about 500 KB before optimisation.

## Hero

| File | Slot | Ratio | Notes |
| --- | --- | --- | --- |
| `images/hero/hero-01.jpg` | Arched hero image | 3 / 4 portrait | The single most important photo. Prefer the studio with light and greenery, or the beach seen from the residence. |

## Gallery (homepage, `#gallery`)

The first photo is displayed twice as large as the others.

| File | Suggested subject | Alt text key |
| --- | --- | --- |
| `images/gallery/gallery-01.jpg` | Whole studio seen from the entrance | `gallery.alt.01` |
| `images/gallery/gallery-02.jpg` | Sleeping corner, double bed | `gallery.alt.02` |
| `images/gallery/gallery-03.jpg` | Kitchen and dining corner | `gallery.alt.03` |
| `images/gallery/gallery-04.jpg` | Shower room | `gallery.alt.04` |
| `images/gallery/gallery-05.jpg` | Sofa bed made up | `gallery.alt.05` |
| `images/gallery/gallery-06.jpg` | View over the private garden | `gallery.alt.06` |
| `images/gallery/gallery-07.jpg` | Storage | `gallery.alt.07` |
| `images/gallery/gallery-08.jpg` | Dining corner by the window | `gallery.alt.08` |
| `images/gallery/gallery-09.jpg` | Entrance of the secured residence | `gallery.alt.09` |
| `images/gallery/gallery-10.jpg` | Garden of the residence | `gallery.alt.10` |

If the actual photo differs from the suggested subject, change the matching alt text in
`messages/fr.json`, `messages/en.json` and `messages/de.json` under `gallery.alt.*`. The alt text
must describe the photo that is really there (constitution V).

## Area, the "around you" block

| File | Subject |
| --- | --- |
| `images/area/beach.jpg` | Les Sablettes sandy beach |
| `images/area/park.jpg` | The seaside park |
| `images/area/boat.jpg` | The shuttle boat or its landing stage |

## Host portrait (optional)

| File | Subject |
| --- | --- |
| `images/host/corine.jpg` | Portrait of Corine, 4 / 5 portrait ratio |

Set `showPortrait` to `false` in `content/host.json` to hide the whole block.

## Guest avatars

| File | Rule |
| --- | --- |
| `images/reviews/001.jpg` ... `images/reviews/165.jpg` | The name must match `image_filename` in `content/reviews.json`. |

Two entries have no custom photo (ids `029` and `081`). Leave those files out: the card renders the
guest's initials instead. Avatars are always served from this repository and never hotlinked from
Airbnb or Booking (FR-010, constitution VI).

Run `npm run check:reviews` to list every avatar the export expects but that is not in the repo yet.

## Brand assets (already generated)

| File | Use |
| --- | --- |
| `brand/favicon.svg` | Copy of the app icon, for reference |
| `brand/wordmark.svg` | Standalone wordmark for documents and channel profiles |

The favicon actually served by the site is `src/app/icon.svg`, and the social card is generated at
build time by `src/app/[locale]/opengraph-image.tsx`.
