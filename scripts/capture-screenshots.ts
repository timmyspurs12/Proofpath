import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
const outputDir = new URL('../docs/screenshots/', import.meta.url);
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: new URL('01-home-desktop.png', outputDir).pathname,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Explore a labelled sample' }).click();
  await page.getByRole('heading', { name: 'Renew your UK passport', exact: true }).waitFor();
  await page.screenshot({
    path: new URL('02-plan-desktop.png', outputDir).pathname,
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: new URL('03-plan-mobile.png', outputDir).pathname,
    fullPage: true,
  });
  console.log(
    'Captured three actual browser screenshots in docs/screenshots (labelled sample; no live inference).',
  );
} finally {
  await browser.close();
}
