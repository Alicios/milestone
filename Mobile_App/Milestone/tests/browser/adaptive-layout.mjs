// Export first: node node_modules/expo/bin/cli export --platform web --output-dir .expo/adaptive-web
// Run from the mobile root: node tests/browser/adaptive-layout.mjs
// All remote requests are intercepted. No fixture reads or writes a live account.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('../../../../Web_App/node_modules/playwright');
const { expect } = require('../../../../Web_App/node_modules/@playwright/test');
const root = resolve('.expo/adaptive-web');
const output = resolve('.expo/adaptive-check');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.ttf': 'font/ttf', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, `.${decodeURIComponent(pathname === '/' ? '/index.html' : pathname)}`);
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { const data = await readFile(file); res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }).end(data); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
await mkdir(output, { recursive: true });
const userId = '00000000-0000-4000-8000-000000000001';
const patient = { id: 'patient-fixture', name: 'Layout Patient', email: 'layout@example.invalid', phone: '', care_status: 'active', auth_user_id: userId };
const providers = ['Alex Provider', 'Blair Provider'];
const histories = providers.map((_, i) => [{ id: `message-${i}`, body: 'Move at a comfortable pace and take a break when needed.', sender_kind: 'provider', created_at: new Date().toISOString() }]);
const expires = Math.floor(Date.now() / 1000) + 3600;
const jwt = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: userId, role: 'authenticated', exp: expires })).toString('base64url'), 'layout-fixture'].join('.');
const session = { access_token: jwt, refresh_token: 'layout-fixture', token_type: 'bearer', expires_in: 3600, expires_at: expires, user: { id: userId, email: patient.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } };
const sizes = [[320, 568], [360, 740], [390, 844], [600, 960], [768, 1024], [840, 900], [1024, 768], [1280, 800], [844, 390], [600, 360]];
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Los_Angeles', reducedMotion: 'reduce' });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (!url.hostname.endsWith('.supabase.co')) return route.abort();
    const name = url.pathname.split('/').at(-1);
    const body = route.request().postData() ? route.request().postDataJSON() : {};
    const json = data => route.fulfill({ json: data });
    if (url.pathname.startsWith('/auth/v1/')) return json(name === 'verify' || name === 'token' ? session : session.user);
    if (!url.pathname.includes('/rpc/')) return json([]);
    const providerIndex = body.p_patient_profile_id === 'relationship-1' ? 1 : 0;
    if (name === 'get_my_patient_profile') return json([patient]);
    if (name === 'get_my_care_relationships') return json([{ patient_profile_id: 'relationship-0' }]);
    if (name === 'get_my_routine_assignments') return json([{ id: 'assignment', scheduled_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date()), status: 'scheduled', routine_name_snapshot: 'Daily plan', created_at: '2026-01-01' }]);
    if (name === 'get_my_routine_assignment_prescriptions') return json([
      { exercise_name_snapshot: 'Gentle stretch', sets_snapshot: 1, reps_snapshot: 5, notes_snapshot: 'Move gently and breathe comfortably.' },
      { exercise_name_snapshot: 'Calf stretch', sets_snapshot: 1, timer_seconds_snapshot: 30, notes_snapshot: 'Keep your heel down.' },
    ]);
    if (name === 'get_my_message_inbox') return json(providers.map((name, i) => ({ patient_profile_id: `relationship-${i}`, provider_name: name, provider_professional_title: 'Physical therapist', last_body: histories[i].at(-1).body, last_message_at: histories[i].at(-1).created_at, unread_count: 0 })));
    if (name === 'get_my_messages') return json(histories[providerIndex]);
    if (name === 'send_my_message') {
      const message = { id: crypto.randomUUID(), body: body.p_body, sender_kind: 'patient', created_at: new Date().toISOString() };
      histories[providerIndex].push(message); return json(message.id);
    }
    return json(null);
  });
  const page = await context.newPage();
  const errors = [], results = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(10000);
  const press = name => page.getByRole('button', { name, exact: true }).click();
  async function resize(width, height) {
    await page.setViewportSize({ width, height });
    // Wait for React Native's window subscription and layout to settle.
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  }
  async function check(screen, width, height) {
    const metrics = await page.evaluate(() => {
      const visible = element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
      const textNodes = [...document.querySelectorAll('div')].filter(e => visible(e) && e.childNodes.length === 1 && e.firstChild.nodeType === 3);
      const timer = document.querySelector('[data-testid="exercise-timer"]');
      let timerFits = true;
      if (timer) {
        const canvas = document.createElement('canvas').getContext('2d');
        canvas.font = getComputedStyle(timer).font;
        timerFits = canvas.measureText(timer.textContent).width <= timer.clientWidth + 1;
      }
      return {
        timerFits,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        clipped: textNodes.filter(e => e.scrollWidth > e.clientWidth + 2).map(e => e.textContent),
        outside: textNodes.filter(e => { const r = e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map(e => e.textContent),
      };
    });
    assert.deepEqual(metrics, { timerFits: true, overflow: false, clipped: [], outside: [] }, `${screen} ${width}x${height}`);
    results.push({ screen, width, height, ...metrics });
    await page.screenshot({ path: resolve(output, `${screen}-${width}x${height}.png`) });
  }
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await expect(page.getByRole('textbox', { name: 'Email address' })).toBeVisible();
  for (const [width, height] of sizes) { await resize(width, height); await check('sign-in', width, height); }
  await page.getByRole('textbox', { name: 'Email address' }).fill(patient.email);
  await page.getByRole('textbox', { name: 'Login code' }).fill('123456');
  await press('Sign in');
  await expect(page.getByRole('button', { name: 'Finish setup' })).toBeVisible();
  for (const [width, height] of sizes) { await resize(width, height); await check('setup', width, height); }
  await press('Finish setup');
  await expect(page.getByText('Welcome back, Layout.')).toBeVisible();
  for (const [width, height] of sizes) {
    await resize(width, height);
    await check('home', width, height);
    await expect(page.getByTestId('dashboard-columns')).toHaveCSS('flex-direction', width >= 840 ? 'row' : 'column');
    await press('View routine');
    await expect(page.getByText('Gentle stretch', { exact: true })).toBeVisible();
    await check('routine', width, height);
    await press('Messages');
    await press('Conversation with Alex Provider');
    const composer = page.getByRole('textbox', { name: 'Message to provider' });
    await composer.fill(`Draft at ${width}`);
    await expect(page.getByTestId('conversation-list')).toBeVisible({ visible: width >= 840 });
    await check('messages', width, height);
    const bounds = await composer.boundingBox();
    assert(bounds && bounds.y >= 0 && bounds.y + bounds.height <= height, 'Composer must fit above navigation');
    await press('Back to conversations');
    await press('Home');
    await press('Open profile and settings');
    await expect(page.getByText('Your account', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Preferred name' }).fill('Unsaved draft');
    await check('profile', width, height);
    await press('Close profile and settings');
    await press('Discard changes');
  }
  await resize(1024, 768);
  await press('Messages');
  await press('Compose message');
  await press('Message Blair Provider');
  const composer = page.getByRole('textbox', { name: 'Message to provider' });
  await composer.fill('Draft survives folding');
  await resize(360, 740);
  await expect(composer).toHaveValue('Draft survives folding');
  await expect(page.getByTestId('conversation-list')).toBeHidden();
  await resize(1280, 800);
  await expect(composer).toHaveValue('Draft survives folding');
  await expect(page.getByTestId('conversation-list')).toBeVisible();
  await press('Send message');
  await expect(composer).toHaveValue('');
  await expect(page.getByTestId('conversation-detail').getByText('Draft survives folding', { exact: true })).toBeVisible();
  await press('Home');
  await press('Start routine');
  await press('Start exercise');
  await expect(page.getByTestId('exercise-timer')).not.toHaveText('00.00.00');
  await press('Pause exercise');
  const elapsed = await page.getByTestId('exercise-timer').textContent();
  for (const [width, height] of sizes) {
    await resize(width, height);
    await expect(page.getByTestId('exercise-timer')).toHaveText(elapsed);
    if (width >= 600 && height < 500) {
      for (const control of [page.getByTestId('exercise-timer'), page.getByRole('button', { name: 'Finish exercise', exact: true }), page.getByRole('button', { name: 'Resume exercise', exact: true })]) {
        const bounds = await control.boundingBox();
        assert(bounds && bounds.y >= 0 && bounds.y + bounds.height <= height - 54, `Timer and controls must fit together at ${width}x${height}`);
      }
    }
    await check('exercise-paused', width, height);
  }
  await press('Finish exercise');
  for (const [width, height] of sizes) { await resize(width, height); await check('review', width, height); }
  await press('Next exercise');
  await press('Start exercise');
  await press('Pause exercise');
  await press('Finish exercise');
  await press('Next exercise');
  await expect(page.getByText('ROUTINE COMPLETE!', { exact: true })).toBeVisible();
  for (const [width, height] of sizes) { await resize(width, height); await check('summary', width, height); }
  await press('Return home');
  await press('Open profile and settings');
  const preferredName = page.getByRole('textbox', { name: 'Preferred name' });
  await preferredName.fill('Retained profile draft');
  for (const [width, height] of [[360, 740], [1024, 768], [844, 390]]) {
    await resize(width, height);
    await expect(preferredName).toHaveValue('Retained profile draft');
  }
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  for (const [width, height] of sizes) { await resize(width, height); await check('settings', width, height); }
  await press('Close profile and settings');
  await press('Discard changes');
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ results, errors, statePreservation: true }, null, 2));
  console.log(JSON.stringify({ checks: results.length, sizes, statePreservation: true, errors }));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
