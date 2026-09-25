import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: '**/desktop/**',
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 1000 } },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort --open false',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
