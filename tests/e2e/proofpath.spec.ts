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
  const home = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(home.violations).toEqual([]);
  await openSample(page);
  const plan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(plan.violations).toEqual([]);
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
