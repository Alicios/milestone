import { test, expect } from '@playwright/test'
import { setup, patient, profile } from './fixture.mjs'
const secret = 'SQL clinical_notes Bearer secret-token private backend'
const code = { email: 'patient@example.invalid', otp: '123456', expiresAt: '2099-01-01T00:00:00.000Z' }
const reject = route => route.fulfill({ status: 403, json: { code: '42501', message: secret } })

test('patient creation displays an OTP and existing accounts can regenerate codes safely', async ({ context, page }) => {
  await setup(context)
  let creates = 0; let codes = 0; let failing = false
  await context.route('**/rest/v1/rpc/create_patient', route => { creates++; return route.fulfill({ json: patient }) })
  await context.route('**/rest/v1/patients?**', route => route.fulfill({ json: [{ id: patient, name: 'Synthetic Browser Patient', email: code.email, care_status: 'active', auth_user_id: 'patient-auth', pending_otp_code: '654321', pending_otp_expires_at: code.expiresAt }] }))
  await context.route('**/api/invite-patient', route => { codes++; return failing ? reject(route) : route.fulfill({ json: code }) })
  await page.goto('/dashboard/patients/new')
  await page.getByLabel('Patient name').fill('Synthetic Patient')
  await page.getByLabel('Patient email').fill(code.email)
  await page.getByRole('button', { name: 'Create & Invite Patient' }).click()
  await expect(page.getByText('123456', { exact: true })).toBeVisible()
  await expect(page.getByText(/No email was sent/)).toBeVisible()
  expect(creates).toBe(1); expect(codes).toBe(1)
  await page.goto(`/dashboard/patients/${patient}`)
  await expect(page.getByText('654321', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Send New Login Code' }).click()
  await expect(page.getByText('123456', { exact: true })).toBeVisible()
  failing = true
  await page.getByRole('button', { name: 'Send New Login Code' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'You do not have permission' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(secret)
  expect(creates).toBe(1); expect(codes).toBe(3)
})

test('a malformed OTP success keeps the patient saved without a creation retry', async ({ context, page }) => {
  await setup(context)
  let creates = 0; let codes = 0
  await context.route('**/rest/v1/rpc/create_patient', route => { creates++; return route.fulfill({ json: patient }) })
  await context.route('**/api/invite-patient', route => { codes++; return route.fulfill({ json: { email: code.email } }) })
  await page.goto('/dashboard/patients/new')
  await page.getByLabel('Patient name').fill('Synthetic Patient'); await page.getByLabel('Patient email').fill(code.email)
  await page.getByRole('button', { name: 'Create & Invite Patient' }).click()
  await expect(page.getByRole('heading', { name: 'Patient saved, code unconfirmed' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('do not create this patient again')
  await expect(page.getByRole('button', { name: 'Create & Invite Patient' })).toHaveCount(0)
  expect(creates).toBe(1); expect(codes).toBe(1)
})

test('messaging preserves paginated history and hidden-tab read protection with safe mutation failures', async ({ context, page }) => {
  await setup(context)
  await context.addInitScript(() => {
    window.fixtureVisibility = 'hidden'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.fixtureVisibility })
  })
  const rows = Array.from({ length: 501 }, (_, id) => ({ id: String(id), patient_profile_id: profile, sender_kind: 'patient', body: `Synthetic message ${id}`, created_at: '2026-10-27T12:00:00Z' }))
  let readAt = null; let reads = 0; let sends = 0; let stars = 0; let failure = true
  const offsets = []
  await context.route('**/rest/v1/messages**', route => {
    if (route.request().method() === 'POST') { sends++; return reject(route) }
    const offset = Number(new URL(route.request().url()).searchParams.get('offset') ?? 0); offsets.push(offset)
    return route.fulfill({ json: rows.slice(offset, offset + 500) })
  })
  await context.route('**/rest/v1/message_thread_state**', route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON()
      if ('starred' in body) { stars++; return reject(route) }
      reads++
      if (failure) return reject(route)
      readAt = body.last_read_at; return route.fulfill({ json: null })
    }
    return route.fulfill({ json: [{ patient_profile_id: profile, last_read_at: readAt, starred: false }] })
  })
  await page.goto('/dashboard/messages')
  await expect(page.getByRole('region', { name: 'Conversation with Synthetic' }).getByText('Synthetic message 500', { exact: true })).toBeVisible()
  expect(offsets).toContain(500); expect(reads).toBe(0)
  await page.evaluate(() => { window.fixtureVisibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')) })
  await expect(page.getByRole('alert').filter({ hasText: 'You do not have permission' })).toBeVisible()
  expect(reads).toBeGreaterThan(0)
  failure = false
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(() => readAt).toBe('2026-10-27T12:00:00Z')
  await page.getByRole('button', { name: 'Star conversation', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'You do not have permission' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Reply to this conversation…' }).fill('Retained draft')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeEnabled()
  await expect(page.getByRole('textbox', { name: 'Reply to this conversation…' })).toHaveValue('Retained draft')
  await expect(page.locator('body')).not.toContainText(secret)
  expect(sends).toBe(1); expect(stars).toBe(1)
})

test('routine deletion keeps confirmation and editor on a history-protection rejection', async ({ context, page }) => {
  await setup(context)
  let deletes = 0
  await context.route('**/rest/v1/rpc/delete_routine', route => { deletes++; return route.fulfill({ status: 409, json: { code: '23503', message: secret } }) })
  await page.goto('/dashboard/routines')
  await page.getByRole('button', { name: 'Edit Routine', exact: true }).click()
  await page.getByText('Catalog A', { exact: true }).click()
  await page.getByRole('button', { name: 'Delete Routine', exact: true }).click()
  expect(deletes).toBe(0)
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Delete Routine', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('patient assignments and cannot be deleted')
  await expect(dialog.getByRole('button', { name: 'Delete Routine', exact: true })).toBeEnabled()
  await expect(page.locator('body')).not.toContainText(secret)
  expect(deletes).toBe(1)
})
