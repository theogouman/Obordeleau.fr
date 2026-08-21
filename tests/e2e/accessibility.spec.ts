import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/** Constitution V / FR-020: WCAG 2.2 AA on every Phase 1 page. */
const pages = ['/', '/en', '/de', '/it', '/avis', '/confidentialite', '/mentions-legales'];

for (const path of pages) {
  test(`${path} has no detectable accessibility violation`, async ({ page }) => {
    await page.goto(path);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
}

test('every image carries an alt attribute', async ({ page }) => {
  await page.goto('/');
  const missing = await page.locator('img:not([alt])').count();
  expect(missing).toBe(0);
});

test('the skip link is the first focusable element', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveAttribute('href', '#main');
});
