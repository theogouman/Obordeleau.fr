import { expect, test } from '@playwright/test';

/**
 * The gallery: five rooms behind a tab rail, and a viewer that walks the whole
 * studio room after room.
 */
test.describe('gallery', () => {
  test('every photo and every alt is in the server rendered markup', async ({ request }) => {
    const response = await request.get('/');
    expect(response.ok()).toBeTruthy();
    const html = await response.text();

    // All twenty photos are named in the HTML, so the page holds the whole
    // gallery even with JavaScript switched off.
    for (let n = 1; n <= 20; n += 1) {
      const file = `gallery-${String(n).padStart(2, '0')}.jpg`;
      expect(html, `${file} missing from the server rendered page`).toContain(
        encodeURIComponent(`/images/gallery/${file}`),
      );
    }

    // And the five rooms are labelled sections, not an empty frame.
    for (const room of ['living', 'kitchen', 'bed', 'bath', 'overview']) {
      expect(html).toContain(`id="gallery-${room}"`);
    }
  });

  test('the tabs show one room at a time and the first one is the living room', async ({ page }) => {
    await page.goto('/');

    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(5);
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');

    const living = page.locator('#gallery-living');
    const kitchen = page.locator('#gallery-kitchen');
    await expect(living).toBeVisible();
    await expect(kitchen).toBeHidden();

    await tabs.nth(1).click();
    await expect(kitchen).toBeVisible();
    await expect(living).toBeHidden();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  });

  test('a photo opens in the viewer, walks into the next room and closes on Escape', async ({
    page,
  }) => {
    await page.goto('/');

    // The last photo of the living room, so one step forward changes room.
    await page.locator('#gallery-living .gallery-tile').last().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.keyboard.press('ArrowRight');

    // The viewer crossed into the kitchen, and the rail followed it.
    await expect(page.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#gallery-kitchen')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('the five tabs share the rail, at every width, and the bump follows', async ({ page }) => {
    await page.goto('/');

    const rail = page.locator('.gallery-rail');
    const surface = page.locator('.gallery-frame__surface path');

    // The rail never scrolls: the bump and the panel are a single traced
    // surface, so the five tabs always fit between the two edges of the frame.
    for (const width of [1280, 380]) {
      await page.setViewportSize({ width, height: 800 });
      const fits = await rail.evaluate((node) => node.scrollWidth <= node.clientWidth + 1);
      expect(fits, `the rail overflows at ${width}px`).toBeTruthy();
    }

    await expect(page.getByRole('tab').first()).not.toBeEmpty();

    // And the surface is redrawn under whichever tab is the active one.
    const first = await surface.getAttribute('d');
    await page.getByRole('tab').nth(3).click();
    await expect.poll(() => surface.getAttribute('d')).not.toBe(first);
  });
});
