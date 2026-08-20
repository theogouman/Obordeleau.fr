import { expect, test } from '@playwright/test';

/** User story 1: discover, get reassured, reach a booking channel. */
test.describe('P1 booking journey', () => {
  test('the hero states the promise and offers the Direct call to action', async ({ page }) => {
    await page.goto('/');

    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toContainText('70');

    await expect(page.getByRole('link', { name: /demander mes dates/i }).first()).toBeVisible();
  });

  test('the three channels are present and point at the real listings', async ({ page }) => {
    await page.goto('/');

    const airbnb = page.getByRole('link', { name: /airbnb/i }).first();
    const booking = page.getByRole('link', { name: /booking/i }).first();

    await expect(airbnb).toHaveAttribute('href', /airbnb\.fr\/rooms\/53950636/);
    await expect(booking).toHaveAttribute('href', /booking\.com\/hotel\/fr/);
    await expect(airbnb).toHaveAttribute('rel', /noopener/);
  });

  test('an inquiry can be submitted and confirms to the visitor', async ({ page }) => {
    await page.route('**/api/inquiry', async (route) => {
      await route.fulfill({ status: 200, json: { ok: true } });
    });

    await page.goto('/#book');

    await page.getByLabel(/arrivée/i).fill('2030-07-01');
    await page.getByLabel(/départ/i).fill('2030-07-08');
    await page.getByLabel(/voyageurs/i).fill('2');
    await page.getByLabel(/votre nom/i).fill('Test Voyageur');
    await page.getByLabel(/votre email/i).fill('test@example.com');
    await page.getByLabel(/ces informations servent/i).check();

    // The endpoint rejects submissions filled in under 2.5 seconds.
    await page.waitForTimeout(2800);
    await page.getByRole('button', { name: /envoyer ma demande/i }).click();

    await expect(page.getByText(/demande envoyée/i)).toBeVisible();
  });

  test('an inquiry with reversed dates is refused before any request', async ({ page }) => {
    let called = false;
    await page.route('**/api/inquiry', async (route) => {
      called = true;
      await route.fulfill({ status: 200, json: { ok: true } });
    });

    await page.goto('/#book');
    await page.getByLabel(/arrivée/i).fill('2030-07-08');
    await page.getByLabel(/départ/i).fill('2030-07-01');
    await page.getByLabel(/votre nom/i).fill('Test');
    await page.getByLabel(/votre email/i).fill('test@example.com');
    await page.getByLabel(/ces informations servent/i).check();
    await page.waitForTimeout(2800);
    await page.getByRole('button', { name: /envoyer ma demande/i }).click();

    await expect(page.getByText(/après la date d'arrivée/i)).toBeVisible();
    expect(called).toBe(false);
  });
});

/** FR-012: nothing reaches Google before consent. */
test.describe('map consent gate', () => {
  test('no Google request is made before the visitor accepts', async ({ page }) => {
    const googleRequests: string[] = [];
    page.on('request', (request) => {
      if (/google(apis|)\.com/.test(request.url())) googleRequests.push(request.url());
    });

    await page.goto('/');
    await page.locator('#location').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);

    expect(googleRequests, googleRequests.join('\n')).toHaveLength(0);
    await expect(page.getByRole('link', { name: /ouvrir dans google maps/i }).first()).toBeVisible();
  });
});

/** User story 3: multilingual reach and local SEO. */
test.describe('internationalisation', () => {
  for (const [locale, path, marker] of [
    ['fr', '/', 'plage'],
    ['en', '/en', 'beach'],
    ['de', '/de', 'Strand'],
  ] as const) {
    test(`${locale} renders localized content and metadata`, async ({ page }) => {
      await page.goto(path);

      await expect(page.locator('html')).toHaveAttribute('lang', new RegExp(`^${locale}`));
      await expect(page.getByRole('heading', { level: 1 })).toContainText(marker);

      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveCount(1);

      for (const tag of ['fr-FR', 'en-GB', 'de-DE', 'x-default']) {
        await expect(page.locator(`link[rel="alternate"][hreflang="${tag}"]`)).toHaveCount(1);
      }

      const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
      expect(jsonLd).toContain('VacationRental');
    });
  }

  test('the language switcher keeps the visitor on the same page', async ({ page }) => {
    await page.goto('/avis');
    await page.getByRole('link', { name: /english/i }).first().click();
    await expect(page).toHaveURL(/\/en\/reviews$/);

    await page.getByRole('link', { name: /deutsch/i }).first().click();
    await expect(page).toHaveURL(/\/de\/bewertungen$/);
  });

  test('no raw message key ever renders', async ({ page }) => {
    for (const path of ['/', '/en', '/de', '/avis', '/en/reviews', '/de/bewertungen']) {
      await page.goto(path);
      await expect(page.locator('body')).not.toContainText('[missing:');
    }
  });
});
