import { defineConfig } from '@playwright/test';
const remoteBaseURL = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './tests/browser',
  testIgnore: process.env.TEAM_UI_CONTRACT ? undefined : '**/*-contract.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: remoteBaseURL ?? 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    proxy: remoteBaseURL && !['127.0.0.1','localhost'].includes(new URL(remoteBaseURL).hostname) && process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
  },
  webServer: remoteBaseURL ? undefined : {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
  },
});
