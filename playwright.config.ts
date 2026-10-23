import { defineConfig } from '@playwright/test';

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: process.env.GITHUB_ACTIONS ? 'github' : 'list',
  use: {
    baseURL: externalBaseUrl ?? 'http://127.0.0.1:5173',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        }
      : {},
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://127.0.0.1:5173/api/health',
        reuseExistingServer: true,
        timeout: 45_000,
      },
});
