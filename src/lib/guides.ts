import type { AppPathname } from '@/i18n/routing';

/**
 * The three guides, and what each one is allowed to say.
 *
 * Constitution II applies here more than anywhere else on the site. A page
 * about the neighbourhood is where invented detail creeps in, because nobody
 * checks a sentence about a boat timetable the way they check a price. So a
 * guide is built from three things and nothing else: the distances already
 * confirmed in content/property.json, the photographs in public/images/area,
 * and quotations from real reviews in content/reviews.json.
 *
 * That last source is why these pages can say something Airbnb and the tourist
 * office cannot. A hundred and sixty-eight people have described this street,
 * this park and this jetty in their own words, in four languages, and their
 * accounts are first hand and already translated.
 *
 * What is deliberately absent: departure times, crossing durations, fares,
 * opening hours, the names of restaurants. None of it is in the repository,
 * all of it changes by season, and a page that gets it wrong costs more trust
 * than the traffic it earns. Add it here only once it sits in content/, with
 * a source and a date.
 */

export type GuideId = 'what-to-do' | 'boat-to-toulon' | 'car-free';

export type Guide = {
  id: GuideId;
  pathname: AppPathname;
  /** From public/images/area, the photograph the page opens on. */
  photo: string;
  /** Which around item the photograph illustrates, for its alt text. */
  photoAlt: string;
  /** Ids in content/reviews.json. Quoted in the reader's language. */
  reviewIds: string[];
  /** The sections the page renders, in order. */
  sections: string[];
};

export const GUIDES: Guide[] = [
  {
    id: 'what-to-do',
    pathname: '/what-to-do',
    photo: 'parc-pouillon.jpeg',
    photoAlt: 'around.items.seaside-park.photoAlt',
    reviewIds: ['007', '002', '040'],
    sections: ['beach', 'park', 'water', 'table'],
  },
  {
    id: 'boat-to-toulon',
    pathname: '/boat-to-toulon',
    photo: 'bateau-les-sablettes.jpeg',
    photoAlt: 'around.items.boat-shuttle.photoAlt',
    reviewIds: ['044', '033', '007'],
    sections: ['jetty', 'toulon', 'islands', 'practical'],
  },
  {
    id: 'car-free',
    pathname: '/car-free',
    photo: 'sablettes-plage.jpg',
    photoAlt: 'around.items.beach.photoAlt',
    reviewIds: ['007', '003', '001'],
    sections: ['arrive', 'daily', 'further', 'car'],
  },
];

export function guide(id: GuideId): Guide {
  const found = GUIDES.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown guide: ${id}`);
  return found;
}
