import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: { baseURL: 'http://localhost:8090', channel: process.env.PLAYWRIGHT_CHANNEL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'small-phone', use: { hasTouch: true, viewport: { width: 320, height: 640 } } },
    { name: 'phone', use: { hasTouch: true, viewport: { width: 390, height: 844 } } },
    { name: 'phone-dark', use: { hasTouch: true, viewport: { width: 390, height: 844 }, colorScheme: 'dark' } },
    { name: 'short-landscape', use: { hasTouch: true, viewport: { width: 740, height: 360 } } },
    { name: 'tablet', use: { hasTouch: true, viewport: { width: 820, height: 1180 } } },
    { name: 'wide', use: { viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: 'npx expo start --web --port 8090 --offline',
    url: 'http://localhost:8090',
    timeout: 120000,
    env: { EXPO_PUBLIC_SUPABASE_URL: 'https://provider-test.supabase.co', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'provider-browser-test-public-key', CI: '1' },
  },
});
