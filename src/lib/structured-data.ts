import type { AppPathname, Locale } from '@/i18n/routing';
import { localeTags, routing } from '@/i18n/routing';
import {
  amenities,
  externalMapUrl,
  gallerySequence,
  legal,
  property,
  siteUrl,
} from '@/lib/content';
import { averageRating, curatedReviews, hasReviews, reviewCount } from '@/lib/reviews';
import { localizedUrl } from '@/lib/seo';

/** E.164, which is the form schema.org asks for and not the one humans read. */
const phoneE164 = legal.owner.phone.replace(/[^\d+]/g, '');

/** The first photographs of the gallery, in the order the site shows them. */
const IMAGE_COUNT = 6;

/**
 * FR-022: LodgingBusiness / VacationRental structured data carrying the 3-star
 * classification, the geo point and the aggregate rating.
 */

type Labels = {
  siteName: string;
  description: string;
  amenityLabel: (id: string) => string;
};

export function lodgingJsonLd(locale: Locale, labels: Labels) {
  /*
   * One entity, one URL. The `@id` never changed with the language, which is
   * right (there is one flat), but `url` used to point at whichever
   * translation was rendering, which said the opposite. The canonical French
   * home is the address of the business; `inLanguage` carries the rest.
   */
  const url = localizedUrl('/', routing.defaultLocale);

  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': ['LodgingBusiness', 'VacationRental'],
    '@id': `${siteUrl}/#lodging`,
    name: property.name,
    url,
    inLanguage: localeTags[locale],
    description: labels.description,
    image: gallerySequence
      .slice(0, IMAGE_COUNT)
      .map((photo) => `${siteUrl}/images/gallery/${photo.file}`),
    // The NAP a local listing is judged on. The number is the owner's, read
    // from the same file the legal notice prints it from, so the site and the
    // structured data can never drift apart.
    telephone: phoneE164,
    email: legal.owner.email,
    hasMap: externalMapUrl,
    logo: `${siteUrl}/brand/wordmark.svg`,
    currenciesAccepted: 'EUR',
    // Filled in content/property.json once the owner settles on a band. Left
    // out of the payload entirely while it is null: an invented price range is
    // worse than a missing one.
    priceRange: property.pricing?.priceRange ?? undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: property.address.street,
      postalCode: property.address.postalCode,
      addressLocality: property.address.locality,
      addressRegion: property.address.region,
      addressCountry: property.address.country,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: property.geo.latitude,
      longitude: property.geo.longitude,
    },
    starRating: {
      '@type': 'Rating',
      ratingValue: property.classification.stars,
      bestRating: 5,
    },
    maximumAttendeeCapacity: property.capacity.maxGuests,
    occupancy: {
      '@type': 'QuantitativeValue',
      maxValue: property.capacity.maxGuests,
      unitCode: 'C62',
    },
    floorSize: {
      '@type': 'QuantitativeValue',
      value: property.capacity.sizeSqm,
      unitCode: 'MTK',
    },
    numberOfBathroomsTotal: property.capacity.bathrooms,
    numberOfBedrooms: property.capacity.bedrooms,
    amenityFeature: amenities.map((amenity) => ({
      '@type': 'LocationFeatureSpecification',
      name: labels.amenityLabel(amenity.id),
      value: true,
    })),
    containsPlace: {
      '@type': 'Accommodation',
      additionalType: 'https://schema.org/Apartment',
      name: property.name,
      occupancy: {
        '@type': 'QuantitativeValue',
        maxValue: property.capacity.maxGuests,
        unitCode: 'C62',
      },
      floorSize: {
        '@type': 'QuantitativeValue',
        value: property.capacity.sizeSqm,
        unitCode: 'MTK',
      },
    },
    sameAs: property.channels
      .map((item) => item.url)
      .filter((value): value is string => typeof value === 'string'),
  };

  if (hasReviews) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: averageRating,
      reviewCount,
      bestRating: 5,
      worstRating: 1,
    };

    node.review = curatedReviews(5).map((review) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: review.firstName },
      datePublished: review.dateIso || undefined,
      reviewBody: review.text,
      inLanguage: review.language === 'other' ? undefined : review.language,
      reviewRating: {
        '@type': 'Rating',
        ratingValue: review.rating,
        bestRating: 5,
        worstRating: 1,
      },
    }));
  }

  // Drop undefined values so the emitted JSON stays clean.
  return JSON.parse(JSON.stringify(node));
}

export function websiteJsonLd(locale: Locale, siteName: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteUrl}/#website`,
    name: siteName,
    url: localizedUrl('/', locale),
    inLanguage: localeTags[locale],
    publisher: { '@id': `${siteUrl}/#lodging` },
  };
}

export function breadcrumbJsonLd(
  locale: Locale,
  trail: Array<{ name: string; pathname: AppPathname }>,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: step.name,
      item: localizedUrl(step.pathname, locale),
    })),
  };
}
