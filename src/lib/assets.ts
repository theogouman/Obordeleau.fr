import fs from 'node:fs';
import path from 'node:path';

/**
 * FR-003 / edge case "a missing photo must not break layout": presence is
 * resolved at build time, so a missing file renders a reserved placeholder
 * instead of a broken image, with zero client side JavaScript.
 */
const cache = new Map<string, boolean>();

export function assetExists(publicPath: string): boolean {
  const key = publicPath.startsWith('/') ? publicPath : `/${publicPath}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let exists = false;
  try {
    exists = fs.existsSync(path.join(process.cwd(), 'public', key));
  } catch {
    exists = false;
  }

  cache.set(key, exists);
  return exists;
}
