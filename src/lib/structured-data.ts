import type { AppPathname, Locale } from '@/i18n/routing';
import { localeTags } from '@/i18n/routing';
import { amenities, property, siteUrl } from '@/lib/content';
import { averageRating, curatedReviews, hasReviews, reviewCount } from '@/lib/reviews';
import { localizedUrl } from '@/lib/seo';

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
  const url = localizedUrl('/', locale);

  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': ['LodgingBusiness', 'VacationRental'],
    '@id': `${siteUrl}/#lodging`,
    name: property.name,
    url,
    inLanguage: localeTags[locale],
    description: labels.description,
    image: [`${siteUrl}/images/hero/${property.hero.image}`],
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
    petsAllowed: undefined,
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
