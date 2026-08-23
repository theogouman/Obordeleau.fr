import { readFileSync } from 'node:fs';
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

    // Every photograph the property file lists is named in the HTML, so the
    // page holds the whole gallery even with JavaScript switched off. Read
    // from the file rather than counted here, so retiring a photograph is a
    // change of data and not a change of test.
    // Resolved from the project root, which is where Playwright is run from.
    const { gallery } = JSON.parse(readFileSync('content/property.json', 'utf8')) as {
      gallery: Array<{ file: string }>;
    };
    expect(gallery.length).toBeGreaterThan(0);

    for (const photo of gallery) {
      expect(html, `${photo.file} missing from the server rendered page`).toContain(
        encodeURIComponent(`/images/gallery/${photo.file}`),
      );
    }

    // And the ones that were retired are gone from it.
    for (const file of ['gallery-04.jpg', 'gallery-09.jpg', 'gallery-12.jpg', 'gallery-19.jpg']) {
      expect(html, `${file} is still rendered`).not.toContain(
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

  /**
   * The bump glides, it never teleports. It is worth a test of its own because
   * the way it breaks is silent: anything that replaces the geometry while the
   * spring runs, a resize observer that also hears the panel growing taller for
   * instance, lands the bump on its mark in a single frame and nothing else
   * looks wrong. Living to bathroom is the telling pair, five photos against
   * two, so the panel changes height as the rooms change.
   */
  test('the bump glides from room to room rather than jumping', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.locator('.gallery-frame').scrollIntoViewIfNeeded();
    await expect(page.locator('.gallery-frame__surface path')).toHaveAttribute('d', /./);

    const traced = await page.evaluate(async () => {
      const path = document.querySelector('.gallery-frame__surface path');
      const seen = new Set();
      let running = true;
      const sample = () => {
        seen.add(path?.getAttribute('d'));
        if (running) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      document.querySelectorAll('.gallery-tab')[3].click();
      await new Promise((resolve) => setTimeout(resolve, 500));
      running = false;
      return seen.size;
    });

    // A jump draws two: where it was, where it landed. A spring draws dozens.
    expect(traced, 'the surface was placed instead of animated').toBeGreaterThan(10);
  });

  /**
   * What travels is the card, not the photograph inside it. Measured on the
   * width of the card itself, which carries the transform: it leaves the tile
   * at the tile's size and arrives at its own.
   */
  test('the viewer grows out of its tile as one card, and shrinks back into it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.locator('.gallery-frame').scrollIntoViewIfNeeded();

    const widths = async (act: string) =>
      page.evaluate(async (selector) => {
        const seen = new Set<number>();
        let running = true;
        const tick = () => {
          const card = document.querySelector('.lightbox__frame');
          if (card) seen.add(Math.round(card.getBoundingClientRect().width));
          if (running) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        document.querySelector<HTMLElement>(selector)?.click();
        await new Promise((resolve) => setTimeout(resolve, 700));
        running = false;
        return seen.size;
      }, act);

    // A jump draws one size, or two. An animation draws a handful even on a
    // machine that is dropping frames.
    const opening = await widths('#gallery-living .gallery-tile');
    expect(opening, 'the viewer appeared instead of growing').toBeGreaterThan(5);

    // The photo on screen and the two it sits between are all mounted, which
    // is what makes an arrow press immediate.
    await expect(page.locator('.lightbox__slide')).toHaveCount(3);

    const closing = await widths('.lightbox__close');
    expect(closing, 'the viewer vanished instead of shrinking').toBeGreaterThan(5);

    await expect(page.locator('.lightbox')).toHaveCount(0);
    await expect(page.locator('.gallery-tile img[style*="hidden"]')).toHaveCount(0);
  });
});
