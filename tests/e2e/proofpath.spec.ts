import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

async function openSample(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore a labelled sample' }).click();
  await expect(
    page.getByRole('heading', { name: 'Renew your UK passport', exact: true }),
  ).toBeVisible();
}

test('sample evidence, completion and explicit save survive a reload', async ({ page }) => {
  await openSample(page);
  await expect(page.locator('.action-step')).toHaveCount(6);
  await expect(page.getByText('Interface sample — not a live AI result')).toBeVisible();
  await expect(page.locator('.evidence-supported')).toHaveCount(5);
  await expect(page.locator('.evidence-inferred')).toHaveCount(1);

  const evidence = page.locator('.evidence-detail').first();
  await evidence.locator('summary').click();
  await expect(evidence.getByText(/You must be aged 16 or over/)).toBeVisible();
  await page
    .getByRole('button', { name: 'Mark complete: Confirm the adult renewal route applies' })
    .click();
  await page.getByRole('button', { name: 'Save to browser' }).click();
  await expect(page).toHaveURL(/\/plans\/(?!current$).+/);
  await page.reload();
  await expect(page.locator('.progress-panel')).toContainText('1 of 6 complete');
  await expect(
    page.getByRole('button', { name: 'Mark incomplete: Confirm the adult renewal route applies' }),
  ).toBeVisible();
});

test('editing a supported factual step withdraws support and persists the edit', async ({
  page,
}) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Save to browser' }).click();
  await page.getByRole('button', { name: 'Edit plan' }).click();
  await page
    .getByRole('textbox', { name: 'Title for step 1' })
    .fill('My reviewed adult renewal check');
  await page.locator('.action-step').first().getByRole('button', { name: 'Save step' }).click();
  await expect(page.locator('.action-step').first().locator('.evidence-inferred')).toBeVisible();
  await expect(
    page.locator('.action-step').first().getByText('Edited by you', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Finish editing' }).click();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'My reviewed adult renewal check' }),
  ).toBeVisible();
  await expect(page.locator('.action-step').first().locator('.evidence-inferred')).toBeVisible();
});

test('Markdown export contains provenance and evidence', async ({ page }) => {
  await openSample(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('renew-your-uk-passport.md');
  const content = await readFile((await download.path())!, 'utf8');
  expect(content).toContain('Labelled sample — not live inference');
  expect(content).toContain('https://www.gov.uk/renew-adult-passport');
  expect(content).toContain('Inferred — confirm');
});

test('mobile layout has no horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await openSample(page);
  await expect(page.locator('.action-step')).toHaveCount(6);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
});

test('home and sample plan pass automated WCAG A/AA checks', async ({ page }) => {
  await page.goto('/');
  const home = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(home.violations).toEqual([]);
  await openSample(page);
  const plan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(plan.violations).toEqual([]);
});

test('API and direct SPA routes expose security headers without an auth redirect', async ({
  request,
}) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(health.url()).not.toContain('/login');
  expect((await health.json()).status).toBe('ok');
  expect(health.headers()['cache-control']).toContain('no-store');
  expect(health.headers()['x-content-type-options']).toBe('nosniff');
  expect(health.headers()['x-frame-options']).toBe('DENY');
  expect(health.headers()['referrer-policy']).toBe('no-referrer');

  for (const path of ['/plans/not-in-workspace', '/saved', '/about']) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.url()).not.toContain('/login');
    expect(response.headers()['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  }

  const missing = await request.get('/api/not-a-route');
  expect(missing.status()).toBe(404);
  expect((await missing.json()).error.code).toBe('NOT_FOUND');
});

test('an unconfigured live request shows the real blocker instead of a simulated plan', async ({
  page,
  request,
}) => {
  const health = await (await request.get('/api/health')).json();
  test.skip(
    health.liveInferenceConfigured,
    'This negative test requires an unconfigured server; no paid live call is made.',
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Fill a real UK passport task' }).click();
  await page.getByRole('button', { name: 'Find my next steps' }).click();
  await expect(page.getByRole('alert')).toContainText('Live Nebius inference is not configured');
  await expect(
    page.getByRole('heading', { name: 'Renew your UK passport', exact: true }),
  ).toHaveCount(0);
});

test('saved plans reopen durable routes and deletion is confirmed accessibly', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Save to browser' }).click();
  const savedUrl = page.url();
  expect(savedUrl).toMatch(/\/plans\/(?!current$).+/);

  await page
    .locator('.main-nav')
    .getByRole('link', { name: /Saved plans/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Saved plans', exact: true })).toBeVisible();
  await page.locator('.saved-card-main').click();
  await expect(page).toHaveURL(savedUrl);
  await page.reload();
  await expect(page.locator('.action-step')).toHaveCount(6);

  await page
    .locator('.main-nav')
    .getByRole('link', { name: /Saved plans/ })
    .click();
  await page.getByRole('button', { name: 'Delete Renew your UK passport' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete this saved plan?' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.saved-card')).toHaveCount(1);

  await page.getByRole('button', { name: 'Delete Renew your UK passport' }).click();
  await page.getByRole('button', { name: 'Delete plan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No saved paths yet' })).toBeVisible();
  await expect(page.locator('.saved-card')).toHaveCount(0);
});

test('step deletion can be cancelled or confirmed without losing dependency integrity', async ({
  page,
}) => {
  await openSample(page);
  await expect(page.locator('.step-dependencies')).toHaveCount(5);
  await page.getByRole('button', { name: 'Edit plan' }).click();
  await page.getByRole('button', { name: 'Delete step 6' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete this step?' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.action-step')).toHaveCount(6);

  await page.getByRole('button', { name: 'Delete step 6' }).click();
  await page.getByRole('button', { name: 'Delete step', exact: true }).click();
  await expect(page.locator('.action-step')).toHaveCount(5);
  await expect(page.getByRole('heading', { name: 'Track the submitted application' })).toHaveCount(
    0,
  );
});

test('task outlines prefill editable fields without retaining unrelated sources', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Fill a real UK passport task' }).click();
  await expect(page.getByLabel('Official source URLs')).toHaveValue(/gov\.uk/);
  await page.getByRole('button', { name: 'Scholarship documents' }).click();
  await expect(page.getByLabel('Your task')).toHaveValue(
    'Prepare the documents for a scholarship application.',
  );
  await expect(page.getByLabel('Jurisdiction')).toHaveValue('Nigeria');
  await expect(page.getByLabel('Official source URLs')).toHaveValue('');
  await page.getByRole('button', { name: 'Utility bill review' }).click();
  await expect(page.getByLabel('Your task')).toHaveValue(
    'Review an electricity bill and dispute an incorrect charge.',
  );
  await expect(
    page.getByRole('heading', { name: 'Renew your UK passport', exact: true }),
  ).toHaveCount(0);
});

test('all routes avoid horizontal overflow at the six target widths', async ({ page }) => {
  for (const width of [1440, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/about', '/saved']) {
      await page.goto(path);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        `${path} overflows at ${width}px`,
      ).toBe(true);
    }
    await openSample(page);
    await expect(page.locator('.action-step')).toHaveCount(6);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      `Plan overflows at ${width}px`,
    ).toBe(true);
    if (width <= 390) {
      const newPlan = await page.getByRole('link', { name: 'New plan' }).boundingBox();
      expect(newPlan?.height).toBeGreaterThanOrEqual(44);
    }
  }
});

test('mobile supporting routes and confirmation dialog pass WCAG 2.2 A/AA checks', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/about', '/saved']) {
    await page.goto(path);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(result.violations, `${path} has accessibility violations`).toEqual([]);
  }

  await openSample(page);
  const mobilePlan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(mobilePlan.violations).toEqual([]);
  await page.getByRole('button', { name: 'Save to browser' }).click();
  await page
    .locator('.main-nav')
    .getByRole('link', { name: /Saved plans/ })
    .click();
  await page.getByRole('button', { name: 'Delete Renew your UK passport' }).click();
  const dialog = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(dialog.violations).toEqual([]);
});
