import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: 'browser-smoke.spec.js',
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:18763',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'http-server . -p 18763 -c-1 --cors',
    url: 'http://127.0.0.1:18763/',
    reuseExistingServer: true,
    timeout: 30_000
  }
});
