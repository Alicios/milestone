// Export: node node_modules/expo/bin/cli export --platform web --output-dir .expo/review-web
// Run: node tests/browser/exercise-review.mjs
// All remote requests use in-memory fixtures; no live patient data is accessed.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(resolve('package.json'));
const { chromium } = require('../../Web_App/node_modules/playwright');
const { expect } = require('../../Web_App/node_modules/@playwright/test');
const root = resolve(process.argv[2] || '.expo/review-web');
const output = resolve('.expo/review-check');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.ttf': 'font/ttf', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, `.${decodeURIComponent(pathname === '/' ? '/index.html' : pathname)}`);
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
await mkdir(output, { recursive: true });
const userId = '00000000-0000-4000-8000-000000000001';
const snapshotId = '00000000-0000-4000-8000-000000000002';
const patient = { id: 'review-patient', name: 'Review Patient', email: 'review@example.invalid', phone: '', care_status: 'active', auth_user_id: userId };
const expires = Math.floor(Date.now() / 1000) + 3600;
const jwt = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: userId, role: 'authenticated', exp: expires })).toString('base64url'), 'review-fixture'].join('.');
const session = { access_token: jwt, refresh_token: 'review-fixture', token_type: 'bearer', expires_in: 3600, expires_at: expires,
  user: { id: userId, email: patient.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } };
const sizes = [[320, 568], [390, 844], [768, 1024], [844, 390], [390, 320]];
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Los_Angeles', reducedMotion: 'reduce', hasTouch: true });
  const saves = [];
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (!url.hostname.endsWith('.supabase.co')) return route.abort();
    const name = url.pathname.split('/').at(-1);
    const body = route.request().postData() ? route.request().postDataJSON() : {};
    const json = data => route.fulfill({ json: data });
    if (url.pathname.startsWith('/auth/v1/')) return json(name === 'verify' || name === 'token' ? session : session.user);
    if (name === 'get_my_patient_profile') return json([patient]);
    if (name === 'get_my_care_relationships') return json([{ patient_profile_id: 'relationship' }]);
    if (name === 'get_my_routine_assignments') return json([{ id: 'assignment', scheduled_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date()), status: 'scheduled', routine_name_snapshot: 'Daily mobility', created_at: '2026-01-01' }]);
    if (name === 'get_my_routine_assignment_prescriptions') return json([{ id: snapshotId, exercise_name_snapshot: 'Gentle stretch', sets_snapshot: 1, reps_snapshot: 5 }]);
    if (name === 'save_my_routine_exercise_feedback') {
      saves.push(body);
      return json([{ routine_assignment_exercise_id: body.p_routine_assignment_exercise_id, pain_score: body.p_pain_score, feeling: body.p_feeling, explanation: body.p_explanation, reported_at: new Date().toISOString() }]);
    }
    return json([]);
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const press = name => page.getByRole('button', { name, exact: true }).click();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('textbox', { name: 'Email address' }).fill(patient.email);
  await page.getByRole('textbox', { name: 'Login code' }).fill('123456');
  await press('Sign in');
  await press('Finish setup');
  await press('Start routine');
  await press('Start exercise');
  await press('Pause exercise');
  await press('Finish exercise');
  const slider = page.getByRole('slider', { name: 'Pain level' });
  await expect(slider).not.toHaveAttribute('aria-valuenow');
  await press('Next exercise');
  await expect(page.getByRole('alert')).toContainText('pain score');
  const results = [];
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      const cards = ['exercise-summary', 'exercise-feeling', 'exercise-pain'].map(id => page.getByTestId(id));
      const geometry = await Promise.all(cards.map(card => card.evaluate(el => {
        const r = el.getBoundingClientRect(), style = getComputedStyle(el);
        return { top: r.top, bottom: r.bottom, width: r.width, background: style.backgroundColor, border: style.borderColor, radius: style.borderRadius };
      })));
      assert(geometry[0].bottom < geometry[1].top && geometry[1].bottom < geometry[2].top, 'Summary, feeling and pain must be separate, ordered boxes');
      for (const card of geometry.slice(1)) {
        assert.equal(card.width, geometry[0].width);
        assert.equal(card.background, geometry[0].background);
        assert.equal(card.border, geometry[0].border);
        assert.equal(card.radius, geometry[0].radius);
      }
      for (let i = 0; i < cards.length; i++) {
        await cards[i].screenshot({ path: resolve(output, `${scheme}-${width}x${height}-${i}.png`) });
        const clipped = await cards[i].evaluate(el => [...el.querySelectorAll('div')].filter(x => !x.children.length && x.textContent.trim() && x.scrollWidth > x.clientWidth + 2).map(x => x.textContent));
        assert.deepEqual(clipped, [], 'Card text must fit');
      }
      await slider.scrollIntoViewIfNeeded();
      const bounds = await slider.boundingBox();
      await page.mouse.click(bounds.x + 14, bounds.y + bounds.height / 2);
      await expect(slider).toHaveAttribute('aria-valuenow', '1');
      await page.mouse.move(bounds.x + 14, bounds.y + bounds.height / 2);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width - 14, bounds.y + bounds.height / 2, { steps: 10 });
      await page.mouse.up();
      await expect(slider).toHaveAttribute('aria-valuenow', '10');
      await slider.focus();
      await page.keyboard.press('Home');
      await expect(slider).toHaveAttribute('aria-valuenow', '1');
      await page.keyboard.press('ArrowRight');
      await expect(slider).toHaveAttribute('aria-valuenow', '2');
      await page.keyboard.press('End');
      await page.keyboard.press('ArrowLeft');
      await expect(slider).toHaveAttribute('aria-valuenow', '9');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      results.push({ scheme, width, height });
    }
  }
  // Real browser touch events exercise dragging rather than invoking component callbacks.
  await page.setViewportSize({ width: 390, height: 844 });
  await slider.scrollIntoViewIfNeeded();
  const bounds = await slider.boundingBox();
  const cdp = await context.newCDPSession(page);
  const y = bounds.y + bounds.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + 14, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bounds.x + 14 + (bounds.width - 28) * 5 / 9, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(slider).toHaveAttribute('aria-valuenow', '6');
  await press('Exercise felt difficult');
  const explanation = page.getByRole('textbox', { name: 'Tell your provider why' });
  await explanation.fill('My knee felt sore.');
  await page.setViewportSize({ width: 390, height: 320 });
  await explanation.scrollIntoViewIfNeeded();
  await expect(explanation).toHaveValue('My knee felt sore.');
  await explanation.screenshot({ path: resolve(output, 'short-window-explanation.png') });
  await press('Next exercise');
  await expect(page.getByText('ROUTINE COMPLETE!', { exact: true })).toBeVisible();
  assert.equal(saves.length, 1);
  assert.deepEqual(saves[0], { p_routine_assignment_exercise_id: snapshotId, p_pain_score: 6, p_feeling: 'difficult', p_explanation: 'My knee felt sore.' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ layouts: results, mouse: true, touch: true, keyboard: true, savedFeedback: true, errors }));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
