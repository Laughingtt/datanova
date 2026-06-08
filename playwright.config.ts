import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run --workspace=packages/server start',
      port: 3000,
      reuseExistingServer: true,
      timeout: 10000,
    },
    {
      command: 'cd packages/web && npx vite --port 5173 --strictPort',
      port: 5173,
      reuseExistingServer: true,
      timeout: 10000,
    },
  ],
});
