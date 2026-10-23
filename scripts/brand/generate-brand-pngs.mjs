#!/usr/bin/env node
/**
 * Rasterize the ProofPath vector brand assets into the PNG icons referenced by
 * index.html and manifest.webmanifest. Uses the project's Playwright Chromium
 * (CHROMIUM_EXECUTABLE_PATH is honored, matching the E2E setup).
 *
 * Run from the repository root:  node scripts/brand/generate-brand-pngs.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'public', 'brand');
mkdirSync(OUT, { recursive: true });

const TEAL = '#0EA5A7';
const IVORY = '#FAF9F6';

const SYMBOL_PATHS = [
  'M9.2 25.4 V10.8',
  'M9.2 8.6 H14.4 Q21.4 8.6 21.4 14 Q21.4 19.2 15.2 19.2 H9.2',
  'M18.2 9.3 L24.8 5.4',
];
const SYMBOL_ARROW = 'M26.8 4.3 L22.1 4.9 L24.9 8.6 Z';

/** Symbol at a given fraction of an Npx tile, centered on its visual mass. */
function symbolGroup(n, fraction, color) {
  const size = n * fraction;
  const offset = (n - size) / 2;
  const scale = size / 32;
  const paths = SYMBOL_PATHS.map((d) => `<path d="${d}"/>`).join('');
  return `<g transform="translate(${offset} ${offset}) scale(${scale})">
      <g fill="none" stroke="${color}" stroke-width="3.7" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
      <path fill="${color}" d="${SYMBOL_ARROW}"/>
    </g>`;
}

/** Full-bleed teal tile (iOS/maskable apply their own masking). */
const fullTile = (
  n,
  fraction,
) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${n}" height="${n}">
  <rect width="${n}" height="${n}" fill="${TEAL}"/>${symbolGroup(n, fraction, IVORY)}
</svg>`;

/** Rounded teal tile with the same radius language as favicon.svg. */
const roundedTile = (
  n,
  fraction,
) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${n}" height="${n}">
  <rect width="${n}" height="${n}" rx="${n * 0.21875}" fill="${TEAL}"/>${symbolGroup(n, fraction, IVORY)}
</svg>`;

const html = (svg, size, background = 'transparent') => `<!doctype html><meta charset="utf-8" />
<style>
  html, body { margin: 0; width: ${size}px; height: ${size}px; overflow: hidden; background: ${background}; }
  svg { display: block; width: ${size}px; height: ${size}px; }
</style>${svg}`;

const symbolTeal = readFileSync(join(OUT, 'proofpath-symbol.svg'), 'utf8');
const favicon = readFileSync(join(ROOT, 'public', 'favicon.svg'), 'utf8');

const jobs = [
  // Browser-tab fallback, rendered from the canonical favicon vector
  { name: 'favicon-32.png', size: 32, svg: favicon, omit: false },
  // iOS home screen: opaque square, platform applies the corner mask
  { name: 'apple-touch-icon.png', size: 180, svg: fullTile(180, 0.68), omit: false },
  // PWA adaptive icons
  { name: 'icon-192.png', size: 192, svg: roundedTile(192, 0.7), omit: false },
  { name: 'icon-512.png', size: 512, svg: roundedTile(512, 0.7), omit: false },
  { name: 'maskable-512.png', size: 512, svg: fullTile(512, 0.64), omit: false },
  // Transparent standalone mark for marketing/docs use
  { name: 'symbol-teal-512.png', size: 512, svg: symbolTeal, omit: true },
];

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
    : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const tab = await context.newPage();
  for (const job of jobs) {
    await tab.setViewportSize({ width: job.size, height: job.size });
    await tab.setContent(html(job.svg, job.size), { waitUntil: 'load' });
    const target = join(OUT, job.name);
    await tab.screenshot({
      path: target,
      omitBackground: job.omit,
      clip: { x: 0, y: 0, width: job.size, height: job.size },
    });
    console.log('wrote', target.replace(ROOT + '/', ''));
  }
  await context.close();
} finally {
  await browser.close();
}
