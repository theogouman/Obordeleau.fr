import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

type MessageTree = { [key: string]: unknown };

/**
 * Deep merge used to guarantee the constitution III rule: a key missing from a
 * translation falls back to French, never to a raw key or a blank string.
 */
function withFrenchFallback(base: MessageTree, override: MessageTree): MessageTree {
  const merged: MessageTree = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const baseValue = merged[key];

    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      baseValue &&
      typeof baseValue === 'object' &&
      !Array.isArray(baseValue)
    ) {
      merged[key] = withFrenchFallback(baseValue as MessageTree, value as MessageTree);
      continue;
    }

    // An empty string is a deliberate "render nothing", so it is kept as is.
    if (value !== undefined && value !== null) {
      merged[key] = value;
    }
  }

  return merged;
}

async function loadMessages(locale: string): Promise<MessageTree> {
  const imported = await import(`../../messages/${locale}.json`);
  return imported.default as MessageTree;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const french = await loadMessages(routing.defaultLocale);
  const messages =
    locale === routing.defaultLocale
      ? french
      : withFrenchFallback(french, await loadMessages(locale));

  return {
    locale,
    messages,
    timeZone: 'Europe/Paris',
    // Never surface a raw message key to a visitor.
    getMessageFallback({ key, namespace }) {
      if (process.env.NODE_ENV !== 'production') {
        return `[missing: ${[namespace, key].filter(Boolean).join('.')}]`;
      }
      return '';
    },
  };
});
