import hostData from '@content/host.json';
import legalData from '@content/legal.json';
import propertyData from '@content/property.json';

/**
 * Constitution II: every fact comes from content/*.json. Components read this
 * module and never inline a number, a URL or an address.
 */

export type ChannelId = 'direct' | 'airbnb' | 'booking';

export type Channel = {
  id: ChannelId;
  priority: number;
  url: string | null;
};

export type QuickFact = {
  id: string;
  value: string;
  unit: string | null;
  confirmed: boolean;
};

export type Amenity = {
  id: string;
  group: 'comfort' | 'practical' | 'family';
  confirmed: boolean;
};

export type AroundItem = {
  id: string;
  distanceM: number | null;
  walkMinutes: number | null;
  confirmed: boolean;
};

export type GalleryItem = {
  file: string;
  altKey: string;
  featured: boolean;
};

export const property = propertyData;
export const host = hostData;
export const legal = legalData;

export const channels = property.channels as Channel[];

export function channel(id: ChannelId): Channel | undefined {
  return channels.find((item) => item.id === id);
}

export const orderedChannels = [...channels].sort((a, b) => a.priority - b.priority);

export const quickFacts = (property.quickFacts as QuickFact[]).filter((fact) => fact.confirmed);

export const amenities = (property.amenities as Amenity[]).filter((item) => item.confirmed);

export const amenityGroups = ['comfort', 'practical', 'family'] as const;

export function amenitiesByGroup(group: (typeof amenityGroups)[number]) {
  return amenities.filter((item) => item.group === group);
}

export const aroundItems = (property.around as AroundItem[]).filter((item) => item.confirmed);

export const gallery = property.gallery as GalleryItem[];

export const featuredGallery = gallery.filter((item) => item.featured);

export const honestNotes = property.honestNotes as string[];

export const formattedAddress = [
  property.address.street,
  `${property.address.postalCode} ${property.address.locality}`,
].join(', ');

/** Deep link that opens the exact coordinates in Google Maps, no API key needed. */
export const externalMapUrl = `https://www.google.com/maps/search/?api=1&query=${property.geo.latitude}%2C${property.geo.longitude}`;

export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.obordeleau.fr').replace(
  /\/$/,
  '',
);

export const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
export const mapsMapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? '';
export const mapIsConfigured = mapsApiKey.length > 0;
