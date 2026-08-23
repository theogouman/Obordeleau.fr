import { expect, test } from '@playwright/test';

/** User story 1: discover, get reassured, reach a booking channel. */
test.describe('P1 booking journey', () => {
  test('the hero states the promise and offers the Direct call to action', async ({ page }) => {
    await page.goto('/');

    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    // The promise is the walk, not the measurement: the distance in metres is
    // still on the page, in the facts bar and in the paragraph under the title.
    await expect(h1).toContainText(/deux minutes/i);

    await expect(page.getByRole('link', { name: /voir les disponibilités/i }).first()).toBeVisible();
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

/**
 * The bar at the top of every page, and the two rules it has to keep: the
 * burger and the controls it hides are never on screen together, and on a wide
 * screen the bar is the top of the page rather than something that follows the
 * reader down it.
 *
 * The first is worth a test because of how quietly it broke. The controls
 * appeared at the small breakpoint while the burger stays until the large one,
 * so a whole band of ordinary laptop widths drew both, and opening the panel
 * showed the same pair a second time.
 */
test.describe('the header bar', () => {
  // The first child of the pill is the row itself; the second is the panel it
  // opens, which holds the same two controls under different classes.
  const ROW = 'header .site-nav-pill > div:first-child';
  const inBar = (page: import('@playwright/test').Page) => ({
    burger: page.locator(`${ROW} .menu-toggle`),
    key: page.locator(`${ROW} .lang-key`),
    book: page.locator(`${ROW} a.btn-primary`),
  });

  test('narrow: the burger alone, and one of each inside it', async ({ page }) => {
    // Between the two breakpoints, which is where both used to be drawn.
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/');

    const bar = inBar(page);
    await expect(bar.burger).toBeVisible();
    await expect(bar.key).toBeHidden();
    await expect(bar.book).toBeHidden();

    await bar.burger.click();
    await expect(page.locator('header .lang-key').filter({ visible: true })).toHaveCount(1);
    await expect(page.locator('header a.btn-primary').filter({ visible: true })).toHaveCount(1);
  });

  test('wide: the two controls, no burger, and the bar stays at the top of the page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    const bar = inBar(page);
    await expect(bar.burger).toBeHidden();
    await expect(bar.key).toBeVisible();
    await expect(bar.book).toBeVisible();

    // In the flow, so scrolling past it leaves it behind rather than carrying
    // it along. And no backdrop filter, which has nothing left to filter.
    const after = await page.evaluate(async () => {
      window.scrollTo({ top: 1800, behavior: 'instant' });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const pill = document.querySelector('.site-nav-pill')!;
      return {
        top: document.querySelector('header')!.getBoundingClientRect().top,
        filter: getComputedStyle(pill).backdropFilter,
      };
    });
    expect(after.top).toBeLessThan(-100);
    expect(after.filter).toBe('none');
  });
});

/**
 * A month with nothing left in it says so, and offers the way out.
 *
 * Thirty struck through squares are not an answer: they say nothing about
 * whether the next month is any better. July and August are taken here and
 * September is open, which is the shape of a real summer.
 */
test.describe('a month we are booked out of', () => {
  const FULL_SUMMER = {
    from: '2030-07-01',
    to: '2031-06-30',
    firstArrival: '2030-07-01',
    minNights: 1,
    country: 'FR',
    paymentsEnabled: false,
    blocked: (() => {
      const nights: string[] = [];
      for (const [month, days] of [
        ['07', 31],
        ['08', 31],
      ] as const) {
        for (let day = 1; day <= days; day += 1) {
          nights.push(`2030-${month}-${String(day).padStart(2, '0')}`);
        }
      }
      return nights;
    })(),
  };

  test('it says so, and one press lands on the month that is open', async ({ page }) => {
    await page.route('**/api/availability', async (route) => {
      await route.fulfill({ status: 200, json: FULL_SUMMER });
    });

    await page.goto('/#book');

    await expect(page.getByText(/complet en juillet/i)).toBeVisible();
    // And no grid of dead squares behind the sentence.
    await expect(page.locator('[data-date^="2030-07-"]')).toHaveCount(0);

    await page.getByRole('button', { name: /prochaines disponibilités/i }).click();

    // September is the first month with a night to take, and its squares are
    // live rather than struck through.
    const september = page.locator('[data-date^="2030-09-"]').first();
    await expect(september).toBeVisible();
    await expect(september).not.toHaveAttribute('aria-disabled', 'true');
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
  // A word of the heading that only exists in that language, so the test can
  // tell a translated page from a page that merely changed its URL.
  for (const [locale, path, marker] of [
    ['fr', '/', 'vacances'],
    ['en', '/en', 'holiday'],
    ['de', '/de', 'Urlaub'],
    ['it', '/it', 'vacanza'],
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

  /**
   * The reader does not move, and the document is not loaded again.
   *
   * Both used to happen, for two separate reasons. Choosing French asked for
   * /fr, which the middleware redirects to /, and the App Router answers a
   * redirect it cannot follow with a full document load. And any language
   * clicked with a real pointer left the focus on a link that the switch was
   * about to remove, which sends the browser to the top of the page. So the
   * test clicks the way a visitor does, from halfway down, and watches the
   * load event as well as the position.
   */
  test('a language change moves neither the page nor the reader', async ({ page }) => {
    await page.goto('/');

    let loads = 0;
    page.on('load', () => {
      loads += 1;
    });

    for (const [locale, expected] of [
      ['en', /\/en$/],
      ['fr', /\/$/],
    ] as const) {
      // focus() then click(), which is what a pointer does and what a scripted
      // click on its own does not: the focus is the whole of the problem. The
      // position is read between the two, because focusing something off screen
      // brings it into view, and a real pointer can only press what is already
      // there.
      const before = await page.evaluate((code) => {
        window.scrollTo({ top: 1500, behavior: 'instant' });
        document
          .querySelector<HTMLElement>(`footer .lang-switch__option[data-locale="${code}"]`)
          ?.focus();
        return Math.round(window.scrollY);
      }, locale);

      await page.evaluate((code) => {
        document
          .querySelector<HTMLElement>(`footer .lang-switch__option[data-locale="${code}"]`)
          ?.click();
      }, locale);

      await expect(page).toHaveURL(expected);
      await expect(page.locator('html')).toHaveAttribute('lang', new RegExp(`^${locale}`));
      // Polled rather than read once: the position is put back over the few
      // frames the arriving tree takes to finish sizing itself, and on a
      // machine running four of these at a time those frames are not instant.
      await expect
        .poll(async () => Math.round(await page.evaluate(() => window.scrollY)), { timeout: 3000 })
        .toBe(before);
    }

    expect(loads, 'the document was loaded again instead of being updated').toBe(0);
  });

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
