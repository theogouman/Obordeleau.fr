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

  const AVAILABILITY = {
    from: '2030-07-01',
    to: '2031-06-30',
    firstArrival: '2030-07-01',
    minNights: 1,
    blocked: ['2030-07-05'],
    country: 'FR',
    paymentsEnabled: true,
  };

  /**
   * The write that must not happen.
   *
   * A stay is confirmed by its deposit, so nothing in the card may reach an
   * endpoint that records one without a payment. Every test in this block
   * watches for it rather than trusting the button labels.
   */
  const watchForFreeWrites = (page: import('@playwright/test').Page) => {
    const attempts: string[] = [];
    page.on('request', (request) => {
      if (/\/api\/reservations/.test(request.url())) attempts.push(request.url());
    });
    return attempts;
  };

  /** One step is mounted at a time, so the card itself is the active step. */
  const onStep = (page: import('@playwright/test').Page) => page.locator('#booking-form');

  /** get_quote's own fields, as /api/quote hands them over. */
  const QUOTE = {
    checkIn: '2030-07-01',
    checkOut: '2030-07-04',
    nightsCount: 3,
    adults: 2,
    minors: 0,
    nights: [],
    accommodationSubtotal: 450,
    cleaningFee: 0,
    touristTax: 9.9,
    total: 459.9,
    // Far off and dear enough to be collected in two parts, so this fixture is
    // the deposit branch: the copy asserted below is the deposit copy.
    paymentMode: 'deposit',
    depositPercentage: 50,
    depositAmount: 225,
    balanceAmount: 234.9,
    balanceChargeDaysBeforeArrival: 10,
    balanceChargeOn: '2030-06-21',
    currency: 'EUR',
  };

  /**
   * The stay, then the party, then the price. The quote is a step of its own
   * now, so every walk through the form goes past it.
   */
  const pickDatesAndParty = async (page: import('@playwright/test').Page) => {
    await page.locator('[data-date="2030-07-01"]').click();
    await page.locator('[data-date="2030-07-04"]').click();
    await onStep(page).getByRole('button', { name: /obtenir le prix/i }).click();

    await onStep(page).locator('button[data-guests="2"]').click();
    await onStep(page).getByRole('radio', { name: /^non$/i }).click();
    // The party step promises the price the same way the calendar does.
    await onStep(page).getByRole('button', { name: /obtenir le prix/i }).click();
  };

  test('no deposit taken, no reservation written', async ({ page }) => {
    const freeWrites = watchForFreeWrites(page);

    await page.route('**/api/availability', async (route) => {
      await route.fulfill({ status: 200, json: AVAILABILITY });
    });
    await page.route('**/api/quote', async (route) => {
      await route.fulfill({ status: 200, json: { valid: true, quote: QUOTE } });
    });

    // The card cannot be opened after all. This is the case that used to fall
    // through to writing the stay for free.
    let checkoutCalls = 0;
    await page.route('**/api/checkout', async (route) => {
      checkoutCalls += 1;
      await route.fulfill({ status: 503, json: { error: 'payments_unavailable' } });
    });

    await page.goto('/#book');

    await pickDatesAndParty(page);

    // The price is shown before a single detail about the visitor is asked for.
    await expect(onStep(page).getByText(/votre devis/i)).toBeVisible();
    await expect(onStep(page).getByText(/acompte à régler aujourd'hui/i)).toBeVisible();
    await onStep(page).getByRole('button', { name: /confirmer ma réservation/i }).click();

    await onStep(page).getByLabel(/votre nom complet/i).fill('Test Voyageur');
    await onStep(page).getByRole('button', { name: /^continuer$/i }).click();
    await onStep(page).getByLabel(/votre mail/i).fill('test@example.com');
    await onStep(page).getByRole('button', { name: /^continuer$/i }).click();
    await onStep(page).locator('#booking-phone').fill('0612345678');
    await onStep(page).getByRole('button', { name: /^continuer$/i }).click();

    // The terminal button asks for a card and for nothing else.
    await expect(onStep(page).getByText(/ces informations sont-elles correctes/i)).toBeVisible();
    await onStep(page).getByRole('button', { name: /payer l'acompte/i }).click();

    await expect(onStep(page).getByText(/réservation en ligne est indisponible/i)).toBeVisible();
    await expect(page.getByText(/réservation confirmée/i)).toHaveCount(0);

    expect(checkoutCalls).toBe(1);
    expect(freeWrites).toEqual([]);
  });

  test('a stay with no price is blocked rather than given away', async ({ page }) => {
    const freeWrites = watchForFreeWrites(page);

    await page.route('**/api/availability', async (route) => {
      await route.fulfill({ status: 200, json: AVAILABILITY });
    });
    // The owner has not set a rate for these nights.
    await page.route('**/api/quote', async (route) => {
      await route.fulfill({ status: 503, json: { error: 'not_priced' } });
    });

    await page.goto('/#book');

    await pickDatesAndParty(page);

    // The quote step is where it stops. There is no way on from here.
    await expect(onStep(page).getByText(/réservation en ligne est indisponible/i)).toBeVisible();
    await expect(onStep(page).getByRole('button', { name: /confirmer ma réservation/i })).toHaveCount(
      0,
    );
    await expect(onStep(page).getByRole('link', { name: /whatsapp/i })).toBeVisible();

    expect(freeWrites).toEqual([]);
  });

  test('a night taken elsewhere is refused and says why', async ({ page }) => {
    await page.route('**/api/availability', async (route) => {
      await route.fulfill({ status: 200, json: AVAILABILITY });
    });

    await page.goto('/#book');

    const taken = page.locator('[data-date="2030-07-05"]');
    await expect(taken).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('[role="tooltip"]', { hasText: /déjà réservé/i }).first()).toHaveCount(
      1,
    );

    await taken.click();
    // Half open ranges: a busy night blocks arrivals, so nothing is selected.
    await expect(page.getByText(/choisissez une date d'arrivée/i)).toBeVisible();
  });

  test('a range taken while the visitor answered is refused cleanly', async ({ page }) => {
    const freeWrites = watchForFreeWrites(page);

    await page.route('**/api/availability', async (route) => {
      await route.fulfill({ status: 200, json: { ...AVAILABILITY, blocked: [] } });
    });
    await page.route('**/api/quote', async (route) => {
      await route.fulfill({ status: 200, json: { valid: true, quote: QUOTE } });
    });
    // The nights went while the visitor was answering, so the hold is refused.
    await page.route('**/api/checkout', async (route) => {
      await route.fulfill({ status: 409, json: { error: 'unavailable' } });
    });

    await page.goto('/#book');

    await pickDatesAndParty(page);
    await onStep(page).getByRole('button', { name: /confirmer ma réservation/i }).click();

    await onStep(page).getByLabel(/votre nom complet/i).fill('Test');
    await onStep(page).getByRole('button', { name: /^continuer$/i }).click();
    await onStep(page).getByLabel(/votre mail/i).fill('test@example.com');
    await onStep(page).getByRole('button', { name: /^continuer$/i }).click();
    await onStep(page).locator('#booking-phone').fill('0612345678');
    await onStep(page).getByRole('button', { name: /^continuer$/i }).click();
    // No fixture here: the engine decides the branch, and the button is named
    // after whichever one it chose.
    await onStep(page).getByRole('button', { name: /payer (l'acompte|le séjour)/i }).click();

    await expect(page.getByRole('alert').first()).toContainText(/viennent d'être prises/i);
    expect(freeWrites).toEqual([]);
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
    ['it', '/it', 'spiaggia'],
  ] as const) {
    test(`${locale} renders localized content and metadata`, async ({ page }) => {
      await page.goto(path);

      await expect(page.locator('html')).toHaveAttribute('lang', new RegExp(`^${locale}`));
      await expect(page.getByRole('heading', { level: 1 })).toContainText(marker);

      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveCount(1);

      for (const tag of ['fr-FR', 'en-GB', 'de-DE', 'it-IT', 'x-default']) {
        await expect(page.locator(`link[rel="alternate"][hreflang="${tag}"]`)).toHaveCount(1);
      }

      const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
      expect(jsonLd).toContain('VacationRental');
    });
  }

  /* The footer keeps the pill, where the four languages are on show at once. */
  test('the footer switcher keeps the visitor on the same page', async ({ page }) => {
    const footer = page.locator('footer');

    await page.goto('/avis');
    await footer.getByRole('link', { name: /english/i }).click();
    await expect(page).toHaveURL(/\/en\/reviews$/);

    await footer.getByRole('link', { name: /deutsch/i }).click();
    await expect(page).toHaveURL(/\/de\/bewertungen$/);

    await footer.getByRole('link', { name: /italiano/i }).click();
    await expect(page).toHaveURL(/\/it\/recensioni$/);
  });

  /* The header carries one key instead, and the list only exists once open. */
  test('the header key opens the language menu and switches from it', async ({ page }) => {
    await page.goto('/avis');

    const header = page.locator('header');
    const key = header.getByRole('button', { name: /changer de langue/i }).filter({ visible: true });

    // Below the small breakpoint the key lives inside the mobile menu.
    if ((await key.count()) === 0) {
      await header.getByRole('button', { name: /ouvrir le menu/i }).click();
    }

    await key.click();
    await header
      .getByRole('menuitemradio', { name: /italiano/i })
      .filter({ visible: true })
      .click();

    await expect(page).toHaveURL(/\/it\/recensioni$/);
  });

  test('no raw message key ever renders', async ({ page }) => {
    for (const path of [
      '/',
      '/en',
      '/de',
      '/it',
      '/avis',
      '/en/reviews',
      '/de/bewertungen',
      '/it/recensioni',
    ]) {
      await page.goto(path);
      await expect(page.locator('body')).not.toContainText('[missing:');
    }
  });
});
