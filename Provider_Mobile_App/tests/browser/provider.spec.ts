import { test, expect, type Page } from '@playwright/test';

const providerId = '10000000-0000-0000-0000-000000000001';
const relationship = '20000000-0000-0000-0000-000000000001';
const patientId = '30000000-0000-0000-0000-000000000001';
const factor = { id: '40000000-0000-0000-0000-000000000001', factor_type: 'totp', status: 'verified', friendly_name: 'Authenticator' };
function dateKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
async function fixture(page: Page, options: { mfa?: boolean; noProvider?: boolean; feedbackFailure?: boolean; sendFailure?: boolean; delayPatients?: number } = {}) {
  const calls: { table: string; method: string; body: any; url: URL }[] = [];
  let starred = false;
  let read = false;
  let failedSend = false;
  let aal = 'aal1';
  const user = () => ({ id: providerId, email: 'provider@example.test', aud: 'authenticated', role: 'authenticated', factors: options.mfa ? [factor] : [], app_metadata: { provider: 'email' }, user_metadata: {} });
  const session = () => {
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    return { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: providerId, exp: now + 3600, iat: now, aal, role: 'authenticated', session_id: 'browser-session', amr: [] })}.${Buffer.from('test-signature').toString('base64url')}`, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user: user() };
  };
  const messages = [{ id: 'message-1', sender_kind: 'patient', body: 'The stretches felt easier today.', created_at: `${dateKey()}T10:00:00Z` }];
  await page.routeWebSocket('wss://provider-test.supabase.co/**', ws => ws.close());
  await page.route('https://provider-test.supabase.co/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1)!;
    const method = request.method();
    const body = request.postDataJSON();
    calls.push({ table, method, body, url });
    const json = (value: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname.endsWith('/token')) return json(session());
    if (url.pathname.endsWith('/user')) return json(user());
    if (url.pathname.endsWith('/challenge')) return json({ id: 'challenge-1', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 });
    if (url.pathname.endsWith('/verify')) { aal = 'aal2'; return json(session()); }
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
    if (table === 'providers') return options.noProvider ? json({ code: 'PGRST116', message: 'No row' }, 406) : json({ id: providerId, name: 'Alex Morgan', professional_title: 'Physical Therapist', contact_email: 'provider@example.test', avatar_url: null, phone: '555-0100', medical_practices: { name: 'Milestone Care' } });
    if (table === 'provider_patient_profiles') {
      if (options.delayPatients) await new Promise(resolve => setTimeout(resolve, options.delayPatients));
      return json([{ id: relationship, patient_id: patientId, discharged_at: null }, { id: 'archived-relationship', patient_id: 'archived-patient', discharged_at: '2026-10-01T12:00:00Z' }]);
    }
    if (table === 'patients') return json([{ id: patientId, name: 'Jamie Rivera', email: 'jamie@example.test', phone: '555-0101', primary_concern: 'Shoulder mobility', treatment_focus: 'Comfortable movement', start_of_care: '2026-10-01', care_status: 'active' }, { id: 'archived-patient', name: 'Taylor Chen', primary_concern: 'Knee recovery' }]);
    if (table === 'routine_assignments') {
      const currentWeek = url.searchParams.getAll('scheduled_date').some(value => value === `gte.${dateKey()}` || (value.startsWith('gte.') && value.slice(4) <= dateKey())) && url.searchParams.getAll('scheduled_date').some(value => value.startsWith('lte.') && value.slice(4) >= dateKey());
      return json(currentWeek ? [{ id: 'assignment-1', patient_profile_id: relationship, routine_name_snapshot: 'Gentle shoulder mobility', scheduled_date: dateKey(), status: 'scheduled', patient_in_progress: true, patient_issue_severity: 'none', patient_comment: 'Feeling more comfortable.', patient_result_source: 'patient' }] : []);
    }
    if (table === 'routine_assignment_exercises') return json([{ id: 'exercise-1', routine_assignment_id: 'assignment-1', exercise_name_snapshot: 'Shoulder rolls', position: 0, sets_snapshot: 2, reps_snapshot: 10, timer_seconds_snapshot: 30, notes_snapshot: 'Keep movement slow and comfortable.' }]);
    if (table === 'routine_assignment_exercise_feedback') return options.feedbackFailure ? json({ code: '42501', message: 'Permission denied' }, 403) : json([{ routine_assignment_exercise_id: 'exercise-1', pain_score: 2, feeling: 'good', explanation: 'Much easier today.', reported_at: `${dateKey()}T11:00:00Z` }]);
    if (table === 'get_provider_message_inbox') return json([{ patient_profile_id: relationship, patient_name: 'Jamie Rivera', last_body: messages.at(-1)!.body, last_message_at: messages.at(-1)!.created_at, unread_count: read ? 0 : 1, starred }]);
    if (table === 'messages') {
      if (method === 'POST') {
        if (options.sendFailure && !failedSend) { failedSend = true; return json({ message: 'Unavailable' }, 503); }
        messages.push({ id: `message-${messages.length + 1}`, sender_kind: 'provider', body: body.body, created_at: new Date().toISOString() });
        return route.fulfill({ status: 201 });
      }
      return json(messages);
    }
    if (table === 'message_thread_state') { if ('starred' in body) starred = body.starred; if ('last_read_at' in body) read = true; return route.fulfill({ status: 204 }); }
    return json([]);
  });
  return { calls };
}
async function signIn(page: Page) {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Work email', exact: true }).fill('provider@example.test');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-test-password');
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
}
async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
test('patient care, archive, week navigation, and feedback render across layouts', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await fixture(page); await signIn(page);
  await expect(page.getByRole('heading', { name: 'Your patients' })).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('patients.png'), fullPage: true });
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByText('Taylor Chen')).toBeVisible();
  await expect(page.getByText('Jamie Rivera')).toHaveCount(0);
  await page.getByRole('button', { name: 'Active patients' }).click();
  await page.getByRole('button', { name: 'Open Jamie Rivera' }).click();
  await page.getByRole('button', { name: /Gentle shoulder mobility/ }).click();
  await expect(page.getByText('Shoulder rolls', { exact: false })).toBeVisible();
  await expect(page.getByText('Pain 2/10 · Feeling good')).toBeVisible();
  await expect(page.getByText('Much easier today.')).toBeVisible();
  await noHorizontalOverflow(page);
  await page.getByText('Much easier today.').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('patient-feedback.png'), fullPage: true });
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  await expect(page.getByText('A clear day')).toBeVisible();
  expect(errors).toEqual([]);
});
test('messaging preserves a failed draft, sends once per retry, and synchronizes star/read state', async ({ page }, testInfo) => {
  const { calls } = await fixture(page, { sendFailure: true }); await signIn(page);
  await page.getByRole('tab', { name: /Messages/ }).click();
  await expect(page.getByRole('heading', { name: 'Messages', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Jamie Rivera/ }).click();
  await expect(page.getByText('The stretches felt easier today.').filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Star conversation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unstar conversation' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Glad to hear it. Keep the movement comfortable.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('alert')).toContainText('could not complete');
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Glad to hear it. Keep the movement comfortable.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Glad to hear it. Keep the movement comfortable.', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText('Glad to hear it. Keep the movement comfortable.', { exact: true }).filter({ visible: true })).toBeInViewport();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
  expect(calls.filter(call => call.table === 'messages' && call.method === 'POST')).toHaveLength(2);
  await expect.poll(() => calls.filter(call => call.table === 'message_thread_state' && call.body.last_read_at).length).toBeGreaterThan(0);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('conversation.png'), fullPage: true });
});
test('MFA prevents care queries until verified, and manual lock hides care data', async ({ page }) => {
  const { calls } = await fixture(page, { mfa: true }); await signIn(page);
  await expect(page.getByRole('textbox', { name: 'Authentication code' })).toBeVisible();
  expect(calls.filter(call => ['patients', 'providers', 'get_provider_message_inbox'].includes(call.table))).toHaveLength(0);
  await page.getByRole('textbox', { name: 'Authentication code' }).fill('123456');
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page.getByRole('heading', { name: 'Your patients' })).toBeVisible();
  await page.getByRole('tab', { name: 'Account' }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dark · Selected' })).toBeVisible();
  await page.getByRole('button', { name: 'Lock workspace' }).click();
  await expect(page.getByText('Welcome back.')).toBeVisible();
  await expect(page.getByText('Alex Morgan')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign in to unlock' }).click();
  await expect(page.getByRole('button', { name: 'Sign in to your workspace' })).toBeVisible();
});
test('non-provider identities cannot load patients or messages', async ({ page }) => {
  const { calls } = await fixture(page, { noProvider: true }); await signIn(page);
  await expect(page.getByRole('alert')).toContainText('does not have an accessible provider profile');
  expect(calls.filter(call => ['patients', 'get_provider_message_inbox'].includes(call.table))).toHaveLength(0);
});
test('feedback failure is visible while prescriptions remain readable', async ({ page }) => {
  await fixture(page, { feedbackFailure: true }); await signIn(page);
  await page.getByRole('button', { name: 'Open Jamie Rivera' }).click();
  await page.getByRole('button', { name: /Gentle shoulder mobility/ }).click();
  await expect(page.getByText('Patient exercise feedback could not be loaded. Pull down to retry.')).toBeVisible();
  await expect(page.getByText('2 sets · 10 reps · 30 seconds')).toBeVisible();
  await expect(page.getByText('No feedback reported yet')).toHaveCount(0);
});
test('sign-out prevents pending patient responses from restoring private content', async ({ page }) => {
  await fixture(page, { delayPatients: 1500 }); await signIn(page);
  await page.getByRole('tab', { name: 'Account' }).click();
  await page.getByRole('button', { name: 'Sign out on this device' }).click();
  await expect(page.getByRole('button', { name: 'Sign in to your workspace' })).toBeVisible();
  await page.waitForTimeout(1700);
  await expect(page.getByText('Jamie Rivera')).toHaveCount(0);
  await expect(page.getByText('Alex Morgan')).toHaveCount(0);
});
test('leaving the foreground locks the workspace before returning', async ({ page }) => {
  await fixture(page); await signIn(page);
  await expect(page.getByRole('heading', { name: 'Your patients' })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByLabel('Workspace locked')).toBeVisible();
  await expect(page.getByText('Jamie Rivera')).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByText('Welcome back.')).toBeVisible();
  await expect(page.getByText('Jamie Rivera')).toHaveCount(0);
});
