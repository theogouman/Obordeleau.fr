import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const reviews = JSON.parse(
  readFileSync(join(process.cwd(), 'content', 'reviews.json'), 'utf8'),
) as unknown[];

/** User story 2: social proof through reviews. */
test.describe('reviews', () => {
  test.skip(reviews.length === 0, 'content/reviews.json is still empty');

  test('the reviews page lists every review', async ({ page }) => {
    await page.goto('/avis');
    await expect(page.getByRole('article')).toHaveCount(reviews.length);
  });

  test('the homepage shows the badge and a curated set', async ({ page }) => {
    await page.goto('/');
    await page.locator('#reviews').scrollIntoViewIfNeeded();

    const cards = page.locator('#reviews article');
    expect(await cards.count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator('#reviews').getByText(/165|avis/i).first()).toBeVisible();
  });

  test('avatars are served from this site, never hotlinked', async ({ page }) => {
    await page.goto('/avis');
    const sources = await page.locator('article img').evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLImageElement).currentSrc || (node as HTMLImageElement).src),
    );
    for (const src of sources) {
      expect(new URL(src).origin).toBe(new URL(page.url()).origin);
    }
  });
});
