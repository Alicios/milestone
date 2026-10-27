// Browser integration uses an in-memory API fixture; live RLS/persistence is
// verified separately by Web_App/supabase/tests/messaging.sql (rollback-only).
// First export Expo web to .messaging-work/web and build Web_App.
// Run: node tests/browser/messaging.mjs
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('../../../../Web_App/node_modules/playwright');
const { expect } = require('../../../../Web_App/node_modules/@playwright/test');
const providerId = '00000000-0000-4000-8000-000000000001';
const patientId = '00000000-0000-4000-8000-000000000002';
const patientRecord = '00000000-0000-4000-8000-000000000003';
const relationship = '00000000-0000-4000-8000-000000000004';
const provider = { id: providerId, name: 'Browser Provider', professional_title: 'Physical therapist', initials: 'BP', contact_email: 'provider@example.invalid' };
const patient = { id: patientRecord, name: 'Browser Patient', email: 'patient@example.invalid', phone: '', care_status: 'active', auth_user_id: patientId };
const profile = { id: relationship, patient_id: patientRecord, provider_id: providerId };
function session(id) {
  const payload = { sub: id, role: 'authenticated', aal: 'aal1', exp: Math.floor(Date.now() / 1000) + 3600 };
  const token = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify(payload)).toString('base64url'), 'browser-fixture'].join('.');
  return { access_token: token, refresh_token: `fixture-${id}`, token_type: 'bearer', expires_in: 3600, expires_at: payload.exp,
    user: { id, email: id === providerId ? 'provider@example.invalid' : patient.email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, factors: [] } };
}
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
function serve(root, port) {
  const server = createServer(async (req, res) => {
    let path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
    if (!extname(path)) path = resolve(root, 'index.html');
    try { const data = await readFile(path); res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }).end(data); }
    catch { res.writeHead(404).end(); }
  });
  return new Promise(done => server.listen(port, '127.0.0.1', () => done(server)));
}
const servers = [await serve(resolve('.messaging-work/web'), 4191), await serve(resolve('../../Web_App/dist'), 4192)];
await mkdir('.messaging-work/screenshots', { recursive: true });
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const width of [390, 1365]) {
    const messages = [], states = new Map();
    let failPatient = false;
    async function setup(context, id, authenticate = true) {
      if (authenticate) await context.addInitScript(value => { localStorage.setItem('sb-lwldkhrsngwtuhztlmul-auth-token', JSON.stringify(value)); }, session(id));
      await context.routeWebSocket('**/realtime/**', ws => ws.close());
      await context.route('https://*.supabase.co/**', async route => {
        const request = route.request(), url = new URL(request.url()), method = request.method();
        const name = url.pathname.split('/').at(-1);
        const body = request.postData() ? request.postDataJSON() : {};
        const json = data => route.fulfill({ json: data, headers: { 'Content-Range': `0-${Math.max(0, data?.length - 1)}/*` } });
        if (url.pathname.startsWith('/auth/v1/')) {
          if (name === 'token') return json(session(id));
          if (name === 'logout') return route.fulfill({ status: 204 });
          return json(session(id).user);
        }
        if (url.pathname.includes('/rpc/')) {
          if (name === 'get_my_patient_profile') return json([patient]);
          if (name === 'get_my_care_relationships') return json([{ patient_profile_id: relationship, provider_id: providerId }]);
          if (name === 'get_my_message_inbox') {
            const last = messages.at(-1), read = states.get(patientId)?.last_read_at;
            return json([{ patient_profile_id: relationship, provider_name: provider.name, provider_professional_title: provider.professional_title,
              last_body: last?.body ?? null, last_message_at: last?.created_at ?? null,
              unread_count: messages.filter(m => m.sender_kind === 'provider' && (!read || m.created_at > read)).length }]);
          }
          if (name === 'get_my_messages') return json(messages);
          if (name === 'send_my_message') {
            if (failPatient) return route.fulfill({ status: 503, json: { message: 'Connection interrupted. Please retry.' } });
            const row = { id: crypto.randomUUID(), patient_profile_id: relationship, sender_kind: 'patient', body: body.p_body, created_at: new Date().toISOString() };
            messages.push(row); return json(row.id);
          }
          if (name === 'read_my_message_thread') { states.set(patientId, { last_read_at: messages.find(m => m.id === body.p_latest_message_id).created_at }); return json(null); }
          if (name === 'get_routine_scheduling_policy') return json({ today: '2026-10-26', lastDate: '2027-01-26', horizonDays: 92, timeZone: 'America/Los_Angeles' });
          return json([]);
        }
        if (name === 'providers') return json(request.headers().accept?.includes('object') ? provider : [provider]);
        if (name === 'patients') return json([patient]);
        if (name === 'provider_patient_profiles') return json([profile]);
        if (name === 'messages') {
          if (method === 'POST') { messages.push({ ...body, id: crypto.randomUUID(), created_at: new Date().toISOString() }); return route.fulfill({ status: 201, json: null }); }
          return json(messages);
        }
        if (name === 'message_thread_state') {
          if (method === 'PATCH') { states.set(id, { ...(states.get(id) || {}), ...body }); return route.fulfill({ status: 204 }); }
          return json([{ patient_profile_id: relationship, last_read_at: null, starred: false, ...states.get(id) }]);
        }
        return json([]);
      });
    }
    const mobile = await browser.newContext({ viewport: { width, height: 900 } });
    const web = await browser.newContext({ viewport: { width, height: 900 } });
    await setup(mobile, patientId, false); await setup(web, providerId);
    const mobilePage = await mobile.newPage(), webPage = await web.newPage(), errors = [];
    mobilePage.setDefaultTimeout(10000); webPage.setDefaultTimeout(10000);
    for (const page of [mobilePage, webPage]) page.on('pageerror', error => { errors.push(error.message); console.log('Browser error:', error.message); });
    await mobilePage.goto('http://127.0.0.1:4191');
    await mobilePage.getByRole('textbox', { name: 'Email address' }).fill(patient.email);
    await mobilePage.getByLabel('Password', { exact: true }).fill('browser-test-password');
    await mobilePage.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(mobilePage.getByText('Welcome back, Browser.')).toBeVisible();
    await webPage.goto('http://127.0.0.1:4192/dashboard/messages');
    await webPage.waitForTimeout(500);
    await webPage.screenshot({ path: `.messaging-work/screenshots/provider-initial-${width}.png`, fullPage: true });
    await expect(webPage.getByRole('button', { name: /Browser Patient/ })).toHaveCount(0);
    await expect(webPage.getByText('No conversations yet', { exact: true })).toBeVisible();
    await webPage.getByRole('button', { name: 'Compose', exact: true }).click();
    await webPage.locator('input[placeholder^="Write a new message"]').fill('Message from provider');
    await webPage.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(webPage.locator('section').getByText('Message from provider', { exact: true })).toBeVisible();
    await mobilePage.reload();
    await expect(mobilePage.getByText('1 unread message', { exact: true })).toBeVisible();
    assert.equal(states.has(patientId), false, 'Home must leave messages unread');
    await mobilePage.getByRole('button', { name: 'Messages', exact: true }).click();
    await mobilePage.getByRole('button', { name: /Conversation with Browser Provider/ }).click();
    await expect(mobilePage.getByText('Message from provider', { exact: true })).toBeVisible();
    await expect.poll(() => states.get(patientId)?.last_read_at).toBeTruthy();
    failPatient = true;
    await mobilePage.getByRole('textbox', { name: 'Message to provider' }).fill('Patient reply');
    await mobilePage.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(mobilePage.getByRole('alert')).toContainText('Connection interrupted');
    await expect(mobilePage.getByRole('textbox', { name: 'Message to provider' })).toHaveValue('Patient reply');
    failPatient = false;
    await mobilePage.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(mobilePage.getByText('Patient reply', { exact: true })).toBeVisible();
    await expect(mobilePage.getByRole('textbox', { name: 'Message to provider' })).toHaveValue('');
    await mobilePage.screenshot({ path: `.messaging-work/screenshots/patient-${width}.png`, fullPage: true });
    await webPage.reload();
    await webPage.getByRole('button', { name: /Browser Patient/ }).click();
    await expect(webPage.locator('section').getByText('Patient reply', { exact: true })).toBeVisible();
    await webPage.screenshot({ path: `.messaging-work/screenshots/provider-${width}.png`, fullPage: true });
    await mobilePage.reload();
    await mobilePage.getByRole('button', { name: 'Messages', exact: true }).click();
    await mobilePage.getByRole('button', { name: /Conversation with Browser Provider/ }).click();
    await expect(mobilePage.getByText('Patient reply', { exact: true })).toBeVisible();
    for (const page of [mobilePage, webPage]) assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
    assert.deepEqual(errors, []);
    assert.equal(messages.length, 2);
    console.log(`PASS ${width}px: patient sign-in, provider send, unread state, patient reply, failure/retry, reload persistence, no overflow or runtime errors`);
    await mobile.close(); await web.close();
  }
} finally {
  await browser?.close();
  for (const server of servers) server.close();
}
