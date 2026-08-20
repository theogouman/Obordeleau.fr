import { expect, test } from '@playwright/test';

/** User story 1: discover, get reassured, reach a booking channel. */
test.describe('P1 booking journey', () => {
  test('the hero states the promise and offers the Direct call to action', async ({ page }) => {
    await page.goto('/');

    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toContainText('70');

    await expect(page.getByRole('link', { name: /réserver mes dates/i }).first()).toBeVisible();
  });

  test('the three channels are present and point at the real listings', async ({ page }) => {
    await page.goto('/');

    const airbnb = page.getByRole('link', { name: /airbnb/i }).first();
    const booking = page.getByRole('link', { name: /booking/i }).first();

    await expect(airbnb).toHaveAttribute('href', /airbnb\.fr\/rooms\/53950636/);
    await expect(booking).toHaveAttribute('href', /booking\.com\/hotel\/fr/);
    await expect(airbnb).toHaveAttribute('rel', /noopener/);
  });

  test('a direct booking is written and confirmed to the visitor', async ({ page }) => {
    await page.route('**/api/availability', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          from: '2030-07-01',
          to: '2031-06-30',
          firstArrival: '2030-07-01',
          minNights: 1,
          blocked: ['2030-07-05'],
        },
      });
    });

    let submitted: Record<string, unknown> | null = null;
    await page.route('**/api/reservations', async (route) => {
      submitted = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        json: { ok: true, reference: 'AB12CD34', from: '2030-07-01', to: '2030-07-04', nights: 3 },
      });
    });

    await page.goto('/#book');

    await page.locator('[data-date="2030-07-01"]').click();
    await page.locator('[data-date="2030-07-04"]').click();
    await page.getByLabel(/votre nom/i).fill('Test Voyageur');
    await page.getByLabel(/votre email/i).fill('test@example.com');
    await page.getByLabel(/gérer ma réservation/i).check();

    // The endpoint rejects submissions filled in under 2.5 seconds.
    await page.waitForTimeout(2800);
    await page.getByRole('button', { name: /réserver ces dates/i }).click();

    await expect(page.getByText(/réservation confirmée/i)).toBeVisible();
    await expect(page.getByText('AB12CD34')).toBeVisible();
    expect(submitted).toMatchObject({ from: '2030-07-01', to: '2030-07-04' });
  });

  test('a night taken elsewhere cannot be selected', async ({ page }) => {
    await page.route('**/api/availability', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          from: '2030-07-01',
          to: '2031-06-30',
          firstArrival: '2030-07-01',
          minNights: 1,
          blocked: ['2030-07-05'],
        },
      });
    });

    await page.goto('/#book');

    const taken = page.locator('[data-date="2030-07-05"]');
    await expect(taken).toHaveAttribute('aria-disabled', 'true');

    await taken.click();
    // Half open ranges: a busy night blocks arrivals, so nothing is selected.
    await expect(page.getByText(/choisissez une date d'arrivée/i)).toBeVisible();
  });

  test('a range taken while the visitor typed is refused cleanly', async ({ page }) => {
    await page.route('**/api/availability', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          from: '2030-07-01',
          to: '2031-06-30',
          firstArrival: '2030-07-01',
          minNights: 1,
          blocked: [],
        },
      });
    });

    await page.route('**/api/reservations', async (route) => {
      await route.fulfill({ status: 409, json: { error: 'unavailable' } });
    });

    await page.goto('/#book');

    await page.locator('[data-date="2030-07-01"]').click();
    await page.locator('[data-date="2030-07-04"]').click();
    await page.getByLabel(/votre nom/i).fill('Test');
    await page.getByLabel(/votre email/i).fill('test@example.com');
    await page.getByLabel(/gérer ma réservation/i).check();
    await page.waitForTimeout(2800);
    await page.getByRole('button', { name: /réserver ces dates/i }).click();

    await expect(page.getByRole('alert')).toContainText(/viennent d'être prises/i);
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
