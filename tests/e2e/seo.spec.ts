import { expect, test, type Page } from '@playwright/test';

/**
 * The head is a deliverable, and nothing was watching it.
 *
 * Every regression this file checks for had already happened. The site name
 * was printed twice in the title of all twelve inner pages, because a layout
 * template appended one to titles that carried it already. Four home titles
 * ran past the width a result page shows, so the place name was the part cut
 * off. The Italian paths were missing from robots.txt for months. None of it
 * is visible in the browser, all of it is visible in the markup, and ten lines
 * of test would have caught each one on the commit that introduced it.
 *
 * These run against the rendered page rather than the source, because what
 * matters is the string a crawler receives.
 */

/** The four languages, and the localized path of each page under test. */
const HOME = [
  { locale: 'fr', tag: 'fr-FR', path: '/' },
  { locale: 'en', tag: 'en-GB', path: '/en' },
  { locale: 'de', tag: 'de-DE', path: '/de' },
  { locale: 'it', tag: 'it-IT', path: '/it' },
] as const;

const REVIEWS = [
  { locale: 'fr', path: '/avis' },
  { locale: 'en', path: '/en/reviews' },
  { locale: 'de', path: '/de/bewertungen' },
  { locale: 'it', path: '/it/recensioni' },
] as const;

/** Roughly what Google renders before it truncates. */
const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;

async function head(page: Page) {
  return page.evaluate(() => ({
    title: document.title,
    canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null,
    description:
      document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? null,
    robots: document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content ?? null,
    alternates: Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]'),
    ).map((link) => ({ hreflang: link.hreflang, href: link.href })),
    jsonLd: Array.from(
      document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
    ).map((script) => JSON.parse(script.textContent ?? '{}') as Record<string, unknown>),
  }));
}

test.describe('titles', () => {
  for (const { locale, path } of HOME) {
    test(`${locale}: the home title fits and names the site once`, async ({ page }) => {
      await page.goto(path);
      const { title } = await head(page);

      expect(title.length).toBeLessThanOrEqual(TITLE_MAX);
      // The regression that shipped: "... | Obordeleau | Obordeleau".
      expect(title.match(/Obordeleau/g)).toHaveLength(1);
    });
  }

  for (const { locale, path } of REVIEWS) {
    test(`${locale}: the reviews title names the site once`, async ({ page }) => {
      await page.goto(path);
      const { title } = await head(page);

      expect(title.match(/Obordeleau/g)).toHaveLength(1);
      expect(title.length).toBeLessThanOrEqual(TITLE_MAX);
    });
  }
});

test.describe('canonicals and alternates', () => {
  for (const { locale, tag, path } of HOME) {
    test(`${locale}: the home points at itself and lists every language`, async ({ page }) => {
      await page.goto(path);
      const { canonical, alternates } = await head(page);

      const self = new URL(page.url());
      expect(canonical).not.toBeNull();
      expect(new URL(canonical as string).pathname).toBe(self.pathname);

      // Four languages plus x-default, and the tags are the ones hreflang
      // expects rather than the bare locale segment.
      expect(alternates).toHaveLength(5);
      const tags = alternates.map((item) => item.hreflang);
      expect(new Set(tags)).toEqual(
        new Set(['fr-FR', 'en-GB', 'de-DE', 'it-IT', 'x-default']),
      );

      // Every language must advertise this page in its own language too.
      const mine = alternates.find((item) => item.hreflang === tag);
      expect(mine?.href).toBe(canonical);

      // x-default is the French version, per FR-006.
      const fallback = alternates.find((item) => item.hreflang === 'x-default');
      const french = alternates.find((item) => item.hreflang === 'fr-FR');
      expect(fallback?.href).toBe(french?.href);
    });
  }

  test('the reviews page canonical keeps its translated segment', async ({ page }) => {
    await page.goto('/de/bewertungen');
    const { canonical } = await head(page);
    expect(canonical).toContain('/de/bewertungen');
  });
});

test.describe('descriptions', () => {
  for (const { locale, path } of [...HOME, ...REVIEWS]) {
    test(`${locale} ${path}: the description is present and fits`, async ({ page }) => {
      await page.goto(path);
      const { description } = await head(page);

      expect(description).toBeTruthy();
      expect((description as string).length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    });
  }
});

test.describe('headings', () => {
  for (const { locale, path } of [...HOME, ...REVIEWS]) {
    test(`${locale} ${path}: exactly one h1`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveCount(1);
    });
  }
});

test.describe('structured data', () => {
  test('the home carries a lodging entity with a full NAP', async ({ page }) => {
    await page.goto('/');
    const { jsonLd } = await head(page);

    const lodging = jsonLd.find((node) => {
      const type = node['@type'];
      return Array.isArray(type) ? type.includes('LodgingBusiness') : type === 'LodgingBusiness';
    });

    expect(lodging, 'no LodgingBusiness node on the home page').toBeDefined();

    const node = lodging as Record<string, unknown>;
    const address = node.address as Record<string, string>;

    // Name, address, phone: the trio local search is judged on. The phone was
    // missing entirely until the audit, though it sat in content/legal.json.
    expect(node.name).toBeTruthy();
    expect(address.streetAddress).toBeTruthy();
    expect(address.addressLocality).toBeTruthy();
    expect(address.postalCode).toBeTruthy();
    expect(node.telephone, 'telephone missing from the lodging entity').toMatch(/^\+\d{6,}$/);

    // Absolute URLs only: a relative one is silently dropped by consumers.
    expect(node.url as string).toMatch(/^https?:\/\//);
    for (const image of node.image as string[]) {
      expect(image).toMatch(/^https?:\/\//);
    }

    // No template placeholder ever reaches the page. Checked value by value:
    // testing the serialized node would match the brackets of every array.
    const values = JSON.stringify(node).match(/"[^"]*"/g) ?? [];
    for (const value of values) {
      expect(value, 'placeholder left in the structured data').not.toMatch(
        /^"\[[^\]]+\]"$|TODO|FIXME/i,
      );
    }
  });

  test('the advertised rating matches the reviews actually published', async ({ page }) => {
    await page.goto('/');
    const { jsonLd } = await head(page);

    const lodging = jsonLd.find((node) => {
      const type = node['@type'];
      return Array.isArray(type) ? type.includes('LodgingBusiness') : type === 'LodgingBusiness';
    }) as Record<string, unknown>;

    const rating = lodging.aggregateRating as Record<string, number> | undefined;
    if (!rating) test.skip(true, 'no reviews published yet');

    // Never rounded up past the truth: a flat 5 out of 168 reviews was the
    // claim before the audit, on a page that shows a three star review.
    const published = rating as Record<string, number>;
    expect(published.ratingValue).toBeLessThanOrEqual(published.bestRating);
    expect(published.reviewCount).toBeGreaterThan(0);

    // The count advertised to search engines is the count a visitor can
    // actually read: never more reviews claimed than published.
    await page.goto('/avis');
    const shown = await page.getByRole('article').count();
    expect(published.reviewCount).toBe(shown);
  });

  test('inner pages carry a breadcrumb', async ({ page }) => {
    await page.goto('/avis');
    const { jsonLd } = await head(page);
    const crumbs = jsonLd.find((node) => node['@type'] === 'BreadcrumbList');
    expect(crumbs).toBeDefined();
  });
});

test.describe('indexability', () => {
  test('the home invites indexing', async ({ page }) => {
    await page.goto('/');
    const { robots } = await head(page);
    expect(robots ?? 'index').not.toContain('noindex');
  });

  for (const path of ['/mentions-legales', '/en/legal-notice', '/it/note-legali']) {
    test(`${path} is noindex and reachable`, async ({ page }) => {
      const response = await page.goto(path);
      // Reachable: a page that robots.txt blocks can never be read, so its
      // noindex is never applied. Both have to be true at once.
      expect(response?.status()).toBe(200);
      const { robots } = await head(page);
      expect(robots).toContain('noindex');
    });
  }

  test('robots.txt does not block what it wants deindexed', async ({ request }) => {
    const body = await (await request.get('/robots.txt')).text();

    expect(body).toContain('Sitemap:');
    for (const blocked of ['/mentions-legales', '/note-legali', '/solde', '/saldo']) {
      expect(body, `${blocked} is both noindex and Disallow`).not.toContain(
        `Disallow: ${blocked}`,
      );
    }
  });

  test('the sitemap lists every language of every public page', async ({ request }) => {
    const body = await (await request.get('/sitemap.xml')).text();
    const locations = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

    for (const { path } of HOME) {
      const expected = new URL(path, 'https://www.obordeleau.fr').toString().replace(/\/$/, '');
      expect(locations).toContain(expected);
    }
    for (const { path } of REVIEWS) {
      expect(locations.some((location) => location.endsWith(path))).toBe(true);
    }

    // What carries a noindex has no business being advertised here.
    for (const secret of ['mentions-legales', 'note-legali', 'solde', 'saldo', 'admin']) {
      expect(locations.some((location) => location.includes(secret))).toBe(false);
    }
  });
});
