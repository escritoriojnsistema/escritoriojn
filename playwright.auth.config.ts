import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/auth', outputDir: './test-results/auth', workers: 1, fullyParallel: false, timeout: 40_000, reporter: 'list',
  // Never retain Auth traces/screenshots: they can contain local credentials and tokens.
  use: { baseURL: 'http://127.0.0.1:3005', trace: 'off', screenshot: 'off', video: 'off', launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } },
});
