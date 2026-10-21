import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, retries: 0,
  outputDir: '/private/tmp/milestone-scrum64-browser-results',
  reporter: [['list']], timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4187', channel: 'chrome', trace: 'retain-on-failure', timezoneId: 'Pacific/Auckland' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4187 --strictPort',
    url: 'http://127.0.0.1:4187', reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: 'https://scrum64-test.supabase.co', VITE_SUPABASE_ANON_KEY: 'local-browser-fixture' },
  },
})
