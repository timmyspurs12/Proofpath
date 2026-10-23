import { chromium, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
const outputDir = new URL('../docs/screenshots/', import.meta.url);
const matrixDir = new URL('viewports/', outputDir);
await mkdir(matrixDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function settle(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => document.fonts.ready);
}

async function openSample(page: Page) {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await settle(page);
  await page.getByRole('button', { name: 'Explore a labelled sample' }).click();
  await page.getByRole('heading', { name: 'Renew your UK passport', exact: true }).waitFor();
  await settle(page);
}

async function capture(page: Page, path: URL, fullPage = true) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.pathname, fullPage, animations: 'disabled' });
}

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });

  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await settle(page);
  await capture(page, new URL('01-home-desktop.png', outputDir));

  await openSample(page);
  await capture(page, new URL('02-plan-desktop.png', outputDir));

  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, new URL('03-plan-mobile.png', outputDir));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Save to browser' }).click();
  await page
    .locator('.main-nav')
    .getByRole('link', { name: /Saved plans/ })
    .click();
  await page.locator('.saved-card-main').waitFor();
  await settle(page);
  await capture(page, new URL('04-saved-desktop.png', outputDir));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseURL}/about`, { waitUntil: 'networkidle' });
  await settle(page);
  await capture(page, new URL('05-about-desktop.png', outputDir));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await settle(page);
  await capture(page, new URL('06-home-mobile.png', outputDir));
  await page.close();

  for (const width of [1440, 1280, 1024, 768, 390, 320]) {
    const matrixPage = await browser.newPage({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
    });
    await matrixPage.goto(baseURL, { waitUntil: 'networkidle' });
    await settle(matrixPage);
    await capture(matrixPage, new URL(`home-${width}.png`, matrixDir), false);
    const homeWidth = await matrixPage.evaluate(() => document.documentElement.scrollWidth);

    await openSample(matrixPage);
    await capture(matrixPage, new URL(`plan-${width}.png`, matrixDir), false);
    const planWidth = await matrixPage.evaluate(() => document.documentElement.scrollWidth);
    console.log(
      `${width}px: home scrollWidth=${homeWidth}; plan scrollWidth=${planWidth}; viewport=${width}`,
    );
    await matrixPage.close();
  }

  console.log(
    'Captured six full-page redesign views and twelve actual viewport images in docs/screenshots (labelled sample; no live inference).',
  );
} finally {
  await browser.close();
}
