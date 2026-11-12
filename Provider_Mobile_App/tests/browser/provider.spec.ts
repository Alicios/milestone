import { test, expect, type Page } from '@playwright/test';

const providerId = '10000000-0000-0000-0000-000000000001';
const relationship = '20000000-0000-0000-0000-000000000001';
const patientId = '30000000-0000-0000-0000-000000000001';
const factor = { id: '40000000-0000-0000-0000-000000000001', factor_type: 'totp', status: 'verified', friendly_name: 'Authenticator' };
function dateKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
async function fixture(page: Page, options: { mfa?: boolean; noProvider?: boolean; feedbackFailure?: boolean; sendFailure?: boolean; delayPatients?: number; multiplePatients?: boolean; avatar?: boolean; statusesFailure?: boolean; archiveFailure?: boolean; archiveRace?: boolean; scheduling?: boolean; uncertainSchedule?: boolean; rejectedTransport?: boolean; staleChange?: boolean; completedIssue?: boolean; homeDemo?: boolean; homeFailure?: boolean } = {}) {
  const calls: { table: string; method: string; body: any; url: URL }[] = [];
  const routineA = '50000000-0000-0000-0000-000000000001';
  const routineB = '50000000-0000-0000-0000-000000000002';
  let assignment: any = { id: options.scheduling ? '60000000-0000-0000-0000-000000000001' : 'assignment-1', routine_id: routineA, updated_at: '2026-11-10T10:00:00.123456Z', patient_profile_id: relationship, routine_name_snapshot: 'Gentle shoulder mobility', scheduled_date: dateKey(), status: options.completedIssue ? 'completed' : 'scheduled', patient_in_progress: !options.scheduling && !options.completedIssue, patient_issue_severity: options.completedIssue ? 'noncritical' : 'none', patient_comment: options.scheduling ? null : 'Feeling more comfortable.', patient_result_source: 'patient' };
  const relativeDate = (offset: number) => { const day = new Date(`${dateKey()}T12:00:00`); day.setDate(day.getDate() + offset); return `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`; };
  if (options.homeDemo) assignment = { ...assignment, status: 'completed', scheduled_date: relativeDate(-1), routine_name_snapshot: 'Feet Fun', patient_in_progress: false, patient_issue_severity: 'noncritical', patient_comment: 'Simulated balance issue.', patient_result_source: 'demo' };
  const homeExtras = options.homeDemo ? [2,3].map(offset => ({ ...assignment, id: `home-completed-${offset}`, scheduled_date: relativeDate(-offset), routine_name_snapshot: offset === 2 ? 'Lower Body' : 'Upper Body', patient_issue_severity: 'none' })) : [];
  const receipts = new Map<string, any>();
  let transportFailed = false;
  const policy = { today: dateKey(), lastDate: new Date(new Date().getTime() + 13 * 86400000).toISOString().slice(0,10), timeZone: 'America/Los_Angeles', horizonDays: 14 };
  let starred = false;
  let read = false;
  let failedSend = false;
  let aal = 'aal1';
  let archivedThroughAt: string | null = null;
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
    if (table === 'provider-avatar.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#357f83" /></svg>' });
    if (url.pathname.endsWith('/token')) return json(session());
    if (url.pathname.endsWith('/user')) return json(user());
    if (url.pathname.endsWith('/challenge')) return json({ id: 'challenge-1', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 });
    if (url.pathname.endsWith('/verify')) { aal = 'aal2'; return json(session()); }
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
    if (table === 'providers') return options.noProvider ? json({ code: 'PGRST116', message: 'No row' }, 406) : json({ id: providerId, name: 'Alex Morgan', professional_title: 'Physical Therapist', contact_email: 'provider@example.test', avatar_url: options.avatar ? 'https://provider-test.supabase.co/storage/v1/object/public/profile-images/provider-avatar.svg' : null, phone: '555-0100', medical_practices: { name: 'Milestone Care' } });
    if (table === 'provider_patient_profiles') {
      if (options.delayPatients) await new Promise(resolve => setTimeout(resolve, options.delayPatients));
      return json([{ id: relationship, patient_id: patientId, discharged_at: null }, { id: 'archived-relationship', patient_id: 'archived-patient', discharged_at: '2026-10-01T12:00:00Z' }, ...(options.multiplePatients ? [{ id: 'relationship-casey', patient_id: 'patient-casey', discharged_at: null }] : [])]);
    }
    if (table === 'patients') return json([{ id: patientId, name: options.homeDemo ? 'Frank Murgolo' : 'Jamie Rivera', email: 'jamie@example.test', phone: '555-0101', primary_concern: 'Shoulder mobility', treatment_focus: 'Comfortable movement', start_of_care: '2026-10-01', care_status: 'active' }, { id: 'archived-patient', name: 'Taylor Chen', primary_concern: 'Knee recovery' }, ...(options.multiplePatients ? [{ id: 'patient-casey', name: 'Casey Park', primary_concern: 'Balance' }] : [])]);
    if (table === 'get_routine_scheduling_policy') return json(policy);
    if (table === 'routines') return json([{ id: routineA, name: 'Gentle shoulder mobility', description: null }, { id: routineB, name: 'Balance practice', description: 'Steady movements' }]);
    if (table === 'preview_routine_schedule') {
      const entry = body.p_entries[0];
      return json({ policy, entries: [{ ...entry, token: 'a'.repeat(64), routineName: entry.routineId === routineB ? 'Balance practice' : 'Gentle shoulder mobility', exercises: [{ name: 'Standing balance', sets: 2, reps: 5, durationSeconds: null, notes: 'Use support' }] }], conflicts: assignment && assignment.scheduled_date === entry.date ? [{ date: entry.date, assignmentId: assignment.id }] : [] });
    }
    if (table === 'get_routine_schedule_request') return json(receipts.get(body.p_request_id) ?? null);
    if (table === 'provider_assignment_change_requests') return json(receipts.has(url.searchParams.get('request_id')?.slice(3) ?? '') ? { result: receipts.get(url.searchParams.get('request_id')!.slice(3)) } : null);
    if (table === 'change_patient_routine' || table === 'assign_routine_schedule') {
      if (options.staleChange && table === 'change_patient_routine') return json({ code: '40001', message: 'Assignment changed' }, 409);
      if (receipts.has(body.p_request_id)) return json(receipts.get(body.p_request_id));
      if (options.rejectedTransport && !transportFailed) { transportFailed = true; return route.abort('failed'); }
      const old = assignment;
      const entry = table === 'change_patient_routine' ? body.p_routine_id ? { routineId: body.p_routine_id, date: old.scheduled_date } : null : body.p_entries[0];
      assignment = entry ? { ...old, id: '60000000-0000-0000-0000-000000000002', routine_id: entry.routineId, routine_name_snapshot: entry.routineId === routineB ? 'Balance practice' : 'Gentle shoulder mobility', scheduled_date: entry.date, status: 'scheduled', updated_at: '2026-11-11T10:00:00Z', patient_in_progress: false, patient_issue_severity: 'none', patient_comment: null, patient_profile_id: relationship } : null;
      const receipt = { requestId: body.p_request_id, patientProfileId: relationship, ...(table === 'change_patient_routine' ? { previousAssignmentId: body.p_assignment_id } : {}), assignments: entry ? [{ id: assignment.id, date: entry.date, routineId: entry.routineId }] : [] };
      receipts.set(body.p_request_id, receipt);
      if (options.uncertainSchedule && !transportFailed) { transportFailed = true; return route.abort('failed'); }
      return json(receipt);
    }
    if (table === 'routine_assignments') {
      if (options.statusesFailure && !url.searchParams.get('select')?.includes('routine_name_snapshot')) return json({ message: 'Unavailable' }, 503);
      if (options.homeFailure) return json({ message: 'Unavailable' }, 503);
      const from = url.searchParams.getAll('scheduled_date').find(value => value.startsWith('gte.'))?.slice(4) ?? '';
      const to = url.searchParams.getAll('scheduled_date').find(value => value.startsWith('lte.'))?.slice(4) ?? '9999-12-31';
      return json([...(assignment ? [assignment] : []), ...homeExtras].filter(row => row.scheduled_date >= from && row.scheduled_date <= to));
    }
    if (options.homeDemo && table === 'routine_assignment_exercises') return json([assignment, ...homeExtras].map((row, i) => ({ id: `home-exercise-${i}`, routine_assignment_id: row.id, exercise_name_snapshot: i === 0 ? 'Feet-Together Balance' : 'Comfortable stretch', position: 0, sets_snapshot: 2, reps_snapshot: 5, timer_seconds_snapshot: null, notes_snapshot: null })));
    if (options.homeDemo && table === 'routine_assignment_exercise_feedback') return json([assignment, ...homeExtras].map((row, i) => ({ routine_assignment_exercise_id: `home-exercise-${i}`, pain_score: i === 0 ? 6 : 2, feeling: i === 0 ? 'difficult' : 'good', explanation: i === 0 ? '[Simulated] I felt unsteady and needed to hold the chair.' : null, reported_at: `${row.scheduled_date}T20:00:00Z` })));
    if (table === 'routine_assignment_exercises') return json([{ id: 'exercise-1', routine_assignment_id: assignment?.id ?? 'assignment-1', exercise_name_snapshot: 'Shoulder rolls', position: 0, sets_snapshot: 2, reps_snapshot: 10, timer_seconds_snapshot: 30, notes_snapshot: 'Keep movement slow and comfortable.' }]);
    if (table === 'routine_assignment_exercise_feedback' && options.scheduling) return json([]);
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
    if (table === 'message_thread_state') {
      if (method === 'GET') return json([{ patient_profile_id: relationship, archived_through_at: archivedThroughAt }]);
      if ('archived_through_at' in body) {
        if (options.archiveFailure) return json({ message: 'Archive unavailable' }, 403);
        archivedThroughAt = body.archived_through_at;
        if (options.archiveRace && archivedThroughAt) incoming();
        return json({ patient_profile_id: relationship, archived_through_at: archivedThroughAt });
      }
      if ('starred' in body) starred = body.starred;
      if ('last_read_at' in body) read = true;
      return route.fulfill({ status: 204 });
    }
    return json([]);
  });
  function incoming() {
    const latest = new Date(messages.at(-1)!.created_at).getTime();
    messages.push({ id: `incoming-${messages.length}`, sender_kind: 'patient', body: 'A new check-in after archiving.', created_at: new Date(latest + 1000).toISOString() });
  }
  return { calls, incoming };
}
async function signIn(page: Page, path = '/patients') {
  await page.goto(path);
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
  await page.getByRole('link', { name: 'Open Jamie Rivera' }).click();
  await expect(page).toHaveURL(new RegExp('/patient/' + relationship));
  await expect(page.getByRole('tab', { name: 'Patients', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: /Gentle shoulder mobility/ }).last().click();
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
  await expect.poll(() => calls.filter(call => call.table === 'message_thread_state' && call.body?.last_read_at).length).toBeGreaterThan(0);
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
  await page.getByRole('tab', { name: 'Open profile menu' }).click();
  await page.getByRole('menuitem', { name: 'App settings', exact: true }).click();
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
  await page.getByRole('link', { name: 'Open Jamie Rivera' }).click();
  await expect(page).toHaveURL(new RegExp('/patient/' + relationship));
  await expect(page.getByRole('tab', { name: 'Patients', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: /Gentle shoulder mobility/ }).last().click();
  await expect(page.getByText('Patient exercise feedback could not be loaded. Pull down to retry.')).toBeVisible();
  await expect(page.getByText('2 sets · 10 reps · 30 seconds')).toBeVisible();
  await expect(page.getByText('No feedback reported yet')).toHaveCount(0);
});
test('sign-out prevents pending patient responses from restoring private content', async ({ page }) => {
  await fixture(page, { delayPatients: 1500 }); await signIn(page);
  await page.getByRole('tab', { name: 'Open profile menu' }).click();
  await page.getByRole('menuitem', { name: 'App settings', exact: true }).click();
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


test('patient filters replace the count card and rows open the patient page by touch', async ({ page }, testInfo) => {
  await fixture(page, { multiplePatients: true }); await signIn(page);
  await expect(page.getByRole('link', { name: 'Open Jamie Rivera' })).toBeVisible();
  await expect(page.getByText('patients in your care')).toHaveCount(0);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Unassigned this week', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open Casey Park' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Jamie Rivera' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'In progress / partially complete', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open Jamie Rivera' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Casey Park' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filter' }).click();
  await page.getByRole('textbox', { name: 'Find a patient' }).fill('Jamie');
  await expect(page.getByRole('link', { name: 'Open Casey Park' })).toHaveCount(0);
  const row = page.getByRole('link', { name: 'Open Jamie Rivera' });
  if (testInfo.project.use.hasTouch) await row.tap(); else await row.click();
  await expect(page).toHaveURL(new RegExp('/patient/' + relationship));
  await expect(page.getByRole('heading', { name: 'Jamie Rivera', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Open profile menu' })).toBeVisible();
  await page.getByRole('tab', { name: 'Patients', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your patients' })).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('filtered-patients.png'), fullPage: true });
});
test('dock photo opens profile and app settings with dismissible upward menu', async ({ page }, testInfo) => {
  await fixture(page, { avatar: true }); await signIn(page);
  const photo = page.getByRole('img', { name: 'Alex Morgan profile photo' });
  await expect(photo).toBeVisible();
  await page.getByRole('tab', { name: 'Open profile menu' }).click();
  await expect(page.getByRole('menu', { name: 'Profile menu' })).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('profile-menu.png'), fullPage: true });
  await page.getByRole('menuitem', { name: 'Profile', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('menu', { name: 'Profile menu' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
  await expect(page.getByText('Alex Morgan', { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Open profile menu' }).click();
  await page.getByRole('menuitem', { name: 'App settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'App settings', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.getByRole('button', { name: /Dark .*Selected/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Open profile menu' }).click();
  await page.getByRole('button', { name: 'Dismiss profile menu', exact: true }).click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole('menu', { name: 'Profile menu' })).toHaveCount(0);
});
test('a failed filter query never labels everyone unassigned', async ({ page }) => {
  await fixture(page, { multiplePatients: true, statusesFailure: true }); await signIn(page);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Unassigned this week', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Patient routine statuses could not be loaded');
  await expect(page.getByRole('link', { name: 'Open Jamie Rivera' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filter' }).click();
  await expect(page.getByRole('link', { name: 'Open Jamie Rivera' })).toBeVisible();
});


async function swipeConversation(page: Page, direction: number, touch: boolean) {
  const row = page.getByRole('button', { name: /^Jamie Rivera/ });
  await row.scrollIntoViewIfNeeded();
  const box = (await row.boundingBox())!;
  const from = box.x + box.width * (direction < 0 ? 0.9 : 0.1);
  const to = box.x + box.width * (direction < 0 ? 0.1 : 0.9);
  const y = box.y + box.height / 2;
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y }] });
    for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from + (to - from) * i / 12, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(from, y); await page.mouse.down();
    await page.mouse.move(to, y, { steps: 12 }); await page.mouse.up();
  }
}
for (const direction of [-1, 1]) test(`swipe ${direction < 0 ? 'left' : 'right'} archives with undo and restores from Archived`, async ({ page }, testInfo) => {
  const { calls } = await fixture(page); await signIn(page);
  await page.getByRole('tab', { name: /Messages/ }).click();
  await expect(page.getByRole('button', { name: /^Jamie Rivera/ })).toBeVisible();
  await swipeConversation(page, direction, Boolean(testInfo.project.use.hasTouch));
  await expect(page.getByText('Conversation archived.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Jamie Rivera/ })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Messages', exact: true })).toBeVisible();
  expect(calls.filter(call => call.table === 'message_thread_state' && call.body?.archived_through_at).length).toBe(1);
  expect(calls.filter(call => call.table === 'messages' && call.method !== 'GET')).toHaveLength(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Jamie Rivera/ })).toBeVisible();
  await page.getByRole('button', { name: 'Archive conversation: Jamie Rivera', exact: true }).click();
  await page.getByRole('button', { name: 'Archived', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Jamie Rivera/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath(`archived-${direction}.png`), fullPage: true });
  await page.getByRole('button', { name: 'Move to inbox: Jamie Rivera', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Jamie Rivera/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Inbox', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Jamie Rivera/ })).toBeVisible();
});
test('archive persists after signing in again and newer activity returns it to inbox', async ({ page }) => {
  const state = await fixture(page); await signIn(page);
  await page.getByRole('tab', { name: /Messages/ }).click();
  await page.getByRole('button', { name: 'Archive conversation: Jamie Rivera', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Jamie Rivera/ })).toHaveCount(0);
  await signIn(page);
  await page.getByRole('tab', { name: /Messages/ }).click();
  await expect(page.getByRole('button', { name: /^Jamie Rivera/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Archived', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Jamie Rivera/ })).toBeVisible();
  state.incoming();
  await page.getByRole('tab', { name: 'Patients', exact: true }).click();
  await page.getByRole('tab', { name: /Messages/ }).click();
  await expect(page.getByText('A new check-in after archiving.')).toBeVisible();
});
test('failed archive keeps the conversation and reports an error', async ({ page }) => {
  await fixture(page, { archiveFailure: true }); await signIn(page);
  await page.getByRole('tab', { name: /Messages/ }).click();
  await page.getByRole('button', { name: 'Archive conversation: Jamie Rivera', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not complete');
  await expect(page.getByRole('button', { name: /^Jamie Rivera/ })).toBeVisible();
  await expect(page.getByText('Conversation archived.', { exact: true })).toHaveCount(0);
});
test('a message arriving during archive is not hidden', async ({ page }) => {
  await fixture(page, { archiveRace: true }); await signIn(page);
  await page.getByRole('tab', { name: /Messages/ }).click();
  await page.getByRole('button', { name: 'Archive conversation: Jamie Rivera', exact: true }).click();
  await expect(page.getByText('A new check-in after archiving.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Jamie Rivera/ })).toBeVisible();
});

test('patient details collapse, calendar combines completion and issues, and selected dock is orange', async ({ page }, testInfo) => {
  await fixture(page, { completedIssue: true }); await signIn(page);
  await page.getByRole('link', { name: 'Open Jamie Rivera' }).click();
  await expect(page.getByText('Shoulder mobility', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText('Comfortable movement', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show patient details', exact: true }).click();
  await expect(page.getByText('Comfortable movement', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hide patient details', exact: true }).click();
  await expect(page.getByText('Comfortable movement', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Gentle shoulder mobility, Completed with issues/ }).first()).toBeVisible();
  const stroke = await page.getByRole('tab', { name: 'Patients', exact: true }).locator('svg').getAttribute('stroke');
  expect(stroke?.toLowerCase()).toBe(testInfo.project.name === 'phone-dark' ? '#ef824b' : '#e9611c');
  await noHorizontalOverflow(page);
  const tile = page.getByRole('button', { name: /Gentle shoulder mobility, Completed with issues/ }).first();
  await expect.poll(async () => { const box = await tile.boundingBox(); return Boolean(box && box.x >= 0 && box.x + box.width <= page.viewportSize()!.width); }).toBe(true);
  await page.getByRole('button', { name: /Gentle shoulder mobility, Completed with issues/ }).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('calendar-status.png'), fullPage: true });
});

test('saved routines replace, remove, and assign from the patient page', async ({ page }, testInfo) => {
  const { calls } = await fixture(page, { scheduling: true }); await signIn(page);
  await page.getByRole('link', { name: 'Open Jamie Rivera' }).click();
  await page.getByRole('button', { name: 'Change routine', exact: true }).click();
  await page.getByRole('button', { name: 'Preview Balance practice', exact: true }).click();
  await expect(page.getByText('Standing balance', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm replacement', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('replacement-preview.png'), fullPage: true });
  await page.getByRole('button', { name: 'Confirm replacement', exact: true }).click();
  await expect(page.getByText('Routine changed.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Balance practice,/ }).last()).toBeVisible();
  const replacement = calls.filter(call => call.table === 'change_patient_routine');
  expect(replacement).toHaveLength(1);
  expect(replacement[0].body.p_routine_id).toBe('50000000-0000-0000-0000-000000000002');
  expect(calls.filter(call => call.table === 'cancel_routine_assignment')).toHaveLength(0);
  await page.getByRole('button', { name: 'Remove routine', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm removal', exact: true }).click();
  await expect(page.getByText('Routine removed.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assign routine', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Assign routine', exact: true }).click();
  await page.getByRole('button', { name: 'Preview Balance practice', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm assignment', exact: true }).click();
  await expect(page.getByText('Routine assigned.', { exact: true })).toBeVisible();
  expect(calls.filter(call => call.table === 'assign_routine_schedule')).toHaveLength(1);
  await noHorizontalOverflow(page);
});

test('lost save response recovers from receipt without submitting a second replacement', async ({ page }) => {
  const { calls } = await fixture(page, { scheduling: true, uncertainSchedule: true }); await signIn(page);
  await page.getByRole('link', { name: 'Open Jamie Rivera' }).click();
  await page.getByRole('button', { name: 'Change routine', exact: true }).click();
  await page.getByRole('button', { name: 'Preview Balance practice', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm replacement', exact: true }).click();
  await page.getByRole('button', { name: 'Check saved request', exact: true }).click();
  await expect(page.getByText('Routine changed.', { exact: true })).toBeVisible();
  expect(calls.filter(call => call.table === 'change_patient_routine')).toHaveLength(1);
});

test('stale replacement leaves original routine and asks for a fresh review', async ({ page }) => {
  const { calls } = await fixture(page, { scheduling: true, staleChange: true }); await signIn(page);
  await page.getByRole('link', { name: 'Open Jamie Rivera' }).click();
  await page.getByRole('button', { name: 'Change routine', exact: true }).click();
  await page.getByRole('button', { name: 'Preview Balance practice', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm replacement', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed');
  await page.getByRole('button', { name: 'Close change routine', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Gentle shoulder mobility,/ }).last()).toBeVisible();
  expect(calls.filter(call => call.table === 'change_patient_routine')).toHaveLength(1);
});


test('retry after a disconnected request keeps the original confirmation UUID', async ({ page }) => {
  const { calls } = await fixture(page, { scheduling: true, rejectedTransport: true }); await signIn(page);
  await page.getByRole('link', { name: 'Open Jamie Rivera' }).click();
  await page.getByRole('button', { name: 'Change routine', exact: true }).click();
  await page.getByRole('button', { name: 'Preview Balance practice', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm replacement', exact: true }).click();
  await page.getByRole('button', { name: 'Retry same request', exact: true }).click();
  await expect(page.getByText('Routine changed.', { exact: true })).toBeVisible();
  const writes = calls.filter(call => call.table === 'change_patient_routine');
  expect(writes).toHaveLength(2);
  expect(writes[0].body).toEqual(writes[1].body);
});

// Model mobile browsers where the keyboard shrinks visualViewport but leaves
// the layout viewport unchanged. These checks do not replace native device QA.
async function keyboardOverlay(page: Page, open: boolean) {
  return page.evaluate(isOpen => {
    const height = isOpen ? window.innerHeight - Math.min(280, window.innerHeight * 0.45) : window.innerHeight;
    Object.defineProperty(window.visualViewport!, 'height', { configurable: true, value: height });
    Object.defineProperty(window.visualViewport!, 'offsetTop', { configurable: true, value: 0 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
    return height;
  }, open);
}
async function inputAboveKeyboard(page: Page, label: string) {
  const input = page.getByLabel(label, { exact: true });
  await input.focus();
  const keyboardTop = await keyboardOverlay(page, true);
  await expect.poll(async () => {
    const box = await input.boundingBox();
    return Boolean(box && box.y >= -1 && box.y + box.height <= keyboardTop + 1);
  }).toBe(true);
}

test('keyboard overlays keep sign-in, searches, assignment fields, and composer visible', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await fixture(page, { scheduling: true });
  await page.goto('/');
  await inputAboveKeyboard(page, 'Work email');
  await inputAboveKeyboard(page, 'Password');
  await page.screenshot({ path: testInfo.outputPath('keyboard-sign-in.png') });
  await keyboardOverlay(page, false);
  await signIn(page);
  await inputAboveKeyboard(page, 'Find a patient');
  await expect(page.getByRole('tab', { name: 'Patients', exact: true })).toHaveCount(0);
  await keyboardOverlay(page, false);
  await page.getByRole('tab', { name: /Messages/ }).click();
  await inputAboveKeyboard(page, 'Find a conversation');
  await keyboardOverlay(page, false);
  await page.getByRole('button', { name: /^Jamie Rivera/ }).click();
  const draft = 'First line\nSecond line\nThird line';
  await page.getByLabel('Message', { exact: true }).fill(draft);
  await inputAboveKeyboard(page, 'Message');
  const keyboardTop = await keyboardOverlay(page, true);
  await expect.poll(async () => {
    const box = await page.getByRole('button', { name: 'Send message', exact: true }).boundingBox();
    return Boolean(box && box.y >= 0 && box.y + box.height <= keyboardTop + 1);
  }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('keyboard-composer.png') });
  await keyboardOverlay(page, false);
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue(draft);
  const originalViewport = page.viewportSize()!;
  const resized = { width: originalViewport.width, height: Math.max(260, originalViewport.height - 200) };
  await page.setViewportSize(resized);
  await keyboardOverlay(page, false);
  await expect.poll(async () => {
    const box = await page.getByLabel('Message', { exact: true }).boundingBox();
    return Boolean(box && box.y >= 0 && box.y + box.height <= resized.height + 1);
  }).toBe(true);
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue(draft);
  await page.setViewportSize(originalViewport);
  await keyboardOverlay(page, false);
  await page.getByRole('tab', { name: 'Patients', exact: true }).click();
  await page.getByRole('link', { name: 'Open Jamie Rivera' }).click();
  await page.getByRole('button', { name: 'Change routine', exact: true }).click();
  await inputAboveKeyboard(page, 'Search saved routines');
  await page.screenshot({ path: testInfo.outputPath('keyboard-assignment.png') });
  await keyboardOverlay(page, false);
  await page.getByRole('button', { name: 'Close change routine', exact: true }).click();
  expect(errors).toEqual([]);
});

test('keyboard overlay keeps the authenticator input visible', async ({ page }) => {
  await fixture(page, { mfa: true });
  await signIn(page);
  await inputAboveKeyboard(page, 'Authentication code');
  await keyboardOverlay(page, false);
  await page.getByLabel('Authentication code', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page.getByRole('heading', { name: 'Your patients' })).toBeVisible();
});


test('Home shows completed Frank routines and the exercise issue, with dated patient navigation', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await fixture(page, { homeDemo: true }); await signIn(page, '/');
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Home', exact: true })).toHaveAttribute('aria-selected', 'true');
  const issue = page.getByRole('button', { name: 'Review Frank Murgolo, Feet-Together Balance', exact: true });
  await expect(issue).toContainText('Pain 6/10');
  await expect(issue).toContainText('Routine completed with an issue');
  await expect(issue).toContainText('Simulated result');
  await expect(page.getByRole('button', { name: /^View completed .* for Frank Murgolo/ })).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath('home-overview.png') });
  await issue.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('home-issue.png') });
  await issue.click();
  await expect(page.getByRole('heading', { name: 'Frank Murgolo', exact: true })).toBeVisible();
  await expect(page.getByText('[Simulated] I felt unsteady and needed to hold the chair.', { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await expect(issue).toBeVisible();
  await page.getByRole('tab', { name: 'Patients', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your patients' })).toBeVisible();
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test('Home never reports all clear after its assignment query fails', async ({ page }) => {
  await fixture(page, { homeFailure: true }); await signIn(page, '/');
  await expect(page.getByRole('alert')).toContainText('could not complete');
  await expect(page.getByText('No issues reported', { exact: true })).toHaveCount(0);
});
