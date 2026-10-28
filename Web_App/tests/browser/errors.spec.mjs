import { test, expect } from '@playwright/test'
import { setup, patient, session } from './fixture.mjs'

const privateMessage = 'SELECT clinical_notes FROM private.patients; Bearer secret-token /database/path'
const replyError = (route, code, status = 400) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code, message: privateMessage, details: privateMessage }) })

test('patient loading and failed reads never appear as patient not found; retry only reads', async ({ context, page }) => {
  await setup(context)
  let release
  const waiting = new Promise(resolve => { release = resolve })
  let failing = true
  await context.route('**/rest/v1/patients?**', async route => {
    if (!failing) return route.fallback()
    await waiting
    return replyError(route, '42501', 403)
  })
  await page.goto(`/dashboard/patients/${patient}`)
  await expect(page.getByText('Loading patient…', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Patient not found' })).toHaveCount(0)
  release()
  await expect(page.getByRole('main').getByRole('button', { name: 'Retry patients', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Patient not found' })).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(privateMessage)
  failing = false
  await page.getByRole('main').getByRole('button', { name: 'Retry patients', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Synthetic Browser Patient' })).toBeVisible()
})

test('a successfully loaded empty patient list still displays the missing patient state', async ({ context, page }) => {
  await setup(context)
  await context.route('**/rest/v1/patients?**', route => route.fulfill({ contentType: 'application/json', body: '[]' }))
  await page.goto(`/dashboard/patients/${patient}`)
  await expect(page.getByRole('heading', { name: 'Patient not found' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('button', { name: 'Retry patients', exact: true })).toHaveCount(0)
})

for (const failure of ['network', 'server']) test(`invitation ${failure} failure preserves a saved patient with no duplicate creation`, async ({ context, page }) => {
  await setup(context)
  let creates = 0; let invites = 0
  await context.route('**/rest/v1/rpc/create_patient', route => {
    creates++
    expect(route.request().postDataJSON()).toEqual({ patient_name: 'Synthetic Patient', patient_phone: null, patient_email: 'patient@example.invalid' })
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(patient) })
  })
  await context.route('**/api/invite-patient', route => {
    invites++
    if (failure === 'network') return route.abort('connectionreset')
    return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: privateMessage }) })
  })
  await page.goto('/dashboard/patients/new')
  await page.getByLabel('Patient name').fill('Synthetic Patient')
  await page.getByLabel('Patient email').fill('patient@example.invalid')
  await page.getByRole('button', { name: 'Create & Invite Patient' }).click()
  await expect(page.getByRole('heading', { name: 'Patient saved, code unconfirmed' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('do not create this patient again')
  await expect(page.getByRole('button', { name: 'Create & Invite Patient' })).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(privateMessage)
  expect(creates).toBe(1); expect(invites).toBe(1)
})

test('creation rejection stays on the form and never sends an invitation', async ({ context, page }) => {
  await setup(context)
  let invites = 0
  await context.route('**/rest/v1/rpc/create_patient', route => replyError(route, '42501', 403))
  await context.route('**/api/invite-patient', route => { invites++; return route.abort() })
  await page.goto('/dashboard/patients/new')
  await page.getByLabel('Patient name').fill('Synthetic Patient')
  await page.getByLabel('Patient email').fill('patient@example.invalid')
  await page.getByRole('button', { name: 'Create & Invite Patient' }).click()
  await expect(page.getByRole('alert')).toContainText('You do not have permission')
  await expect(page.getByRole('button', { name: 'Create & Invite Patient' })).toBeEnabled()
  await expect(page.getByRole('heading', { name: /Patient saved/ })).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(privateMessage)
  expect(invites).toBe(0)
})

test('catalog service errors are safe and keep saving disabled', async ({ context, page }) => {
  await setup(context)
  await context.route('**/rest/v1/exercises?**', route => replyError(route, 'XX000', 500))
  await page.goto('/dashboard/routines')
  await page.getByRole('button', { name: 'New Routine', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'temporarily unavailable' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(privateMessage)
  await page.getByLabel('Routine name').fill('Synthetic routine')
  await expect(page.getByRole('combobox', { name: 'Exercise 1' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Create Routine', exact: true })).toBeDisabled()
})

test('MFA settings failure is safe, does not claim MFA is off, and permits a read retry', async ({ context, page }) => {
  await setup(context)
  let failing = true
  const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message))
  // Establish authentication before failing the settings-specific factor read.
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Open profile menu' }).click()
  await context.route('**/auth/v1/user', route => failing ? replyError(route, 'unexpected_failure', 500) : route.fallback())
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry authenticator settings' })).toBeVisible()
  await expect(page.getByText('Two-factor authentication is off', { exact: true })).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(privateMessage)
  failing = false
  await page.getByRole('button', { name: 'Retry authenticator settings' }).click()
  await expect(page.getByRole('button', { name: 'Set up authenticator app' })).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('rate-limited login gives a safe distinct message and never opens a protected page', async ({ context, page }) => {
  await setup(context, { initialSession: null })
  await context.route('**/auth/v1/token?**', route => replyError(route, 'over_request_rate_limit', 429))
  await page.goto('/login')
  await page.getByLabel('Work email').fill(session.user.email)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('Synthetic-password-123')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Too many requests')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('body')).not.toContainText(privateMessage)
})
