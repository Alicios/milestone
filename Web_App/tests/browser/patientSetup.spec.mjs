import { test, expect } from '@playwright/test'
import { setup, patient } from './fixture.mjs'

async function setupFlow(context) {
  await setup(context)
  const state = { patientId: patient, name: 'Synthetic Setup Patient', email: 'wrong@example.invalid', status: 'awaiting_code',
    setupComplete: false, needsReconciliation: false, code: '123456', codeExpiresAt: '2099-01-01T00:00:00Z', saves: [], codes: 0, failSave: null, failLoad: false, reads: 0 }
  await context.route('**/rest/v1/rpc/get_patient_onboarding_statuses', route => {
    state.reads++
    if (state.failLoad) return route.fulfill({ status: 500, json: { code: 'XX000' } })
    return route.fulfill({ json: state.setupComplete ? [] : [
      { patient_id: patient, name: state.name, status: state.status, needs_reconciliation: state.needsReconciliation },
    ] })
  })
  await context.route('**/rest/v1/rpc/get_patient_onboarding_details', route => route.fulfill({ json: state }))
  await context.route('**/api/update-patient-onboarding', async route => {
    const body = route.request().postDataJSON(); state.saves.push(body)
    await new Promise(resolve => setTimeout(resolve, 100))
    if (state.failSave) {
      if (state.failSave === 'RECONCILIATION_REQUIRED') state.needsReconciliation = true
      if (state.failSave === 'SETUP_COMPLETE') { state.setupComplete = true; state.status = 'setup_complete' }
      return route.fulfill({ status: 409, json: { error: { code: state.failSave, message: 'private diagnostic must not be shown' } } })
    }
    const emailChanged = state.email !== body.email
    state.name = body.name; state.email = body.email; state.needsReconciliation = false
    if (emailChanged) { state.code = null; state.codeExpiresAt = null; state.status = 'invitation_needed' }
    return route.fulfill({ json: { name: state.name, email: state.email, emailChanged } })
  })
  await context.route('**/api/invite-patient', route => {
    state.codes++; state.code = '654321'; state.codeExpiresAt = '2099-01-01T00:00:00Z'; state.status = 'awaiting_code'
    return route.fulfill({ json: { email: state.email, otp: state.code, expiresAt: state.codeExpiresAt, emailStatus: 'sent' } })
  })
  return state
}

for (const width of [390, 1365]) for (const theme of ['light', 'dark']) {
  test(`setup box and correction workflow at ${width}px ${theme}`, async ({ context, page }, info) => {
    const state = await setupFlow(context)
    await page.setViewportSize({ width, height: 950 })
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.goto('/dashboard/settings')
    await page.getByRole('radio', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true }).check()
    await page.evaluate(() => { history.pushState({}, '', '/dashboard'); dispatchEvent(new PopStateEvent('popstate')) })
    await expect(page.locator('[data-milestone-theme]')).toHaveAttribute('data-milestone-theme', theme)
    await expect(page.getByRole('link', { name: 'Add patient', exact: true })).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'New Patient', exact: true })).toHaveCount(0)
    await expect(page.getByText('Awaiting code entry', { exact: true })).toBeVisible()
    await expect(page.locator('.dashboard-overview')).toHaveCSS('opacity', '1')
    await page.screenshot({ path: info.outputPath('setup-box.png'), fullPage: true })
    await page.getByRole('link', { name: state.name, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/patients/${patient}/setup$`))
    const name = page.getByRole('textbox', { name: 'Full name' }), email = page.getByRole('textbox', { name: 'Email address' })
    await expect(name).toHaveValue(state.name); await expect(email).toHaveValue(state.email)
    await name.fill('Corrected Setup Patient')
    await email.fill('invalid')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByText('Enter a valid email address.', { exact: true })).toBeVisible()
    expect(state.saves).toHaveLength(0)
    await email.fill('correct@example.invalid')
    await expect(page.getByRole('button', { name: 'Generate new login code' })).toBeDisabled()
    await expect(page.getByText('123456', { exact: true })).toHaveCount(0)
    await page.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit() })
    await expect(page.getByText(/Details saved. Generate a new login code/)).toBeVisible()
    expect(state.saves).toHaveLength(1); expect(state.codes).toBe(0)
    await expect(page.getByText('Invitation needed', { exact: true })).toBeVisible()
    await expect(page.getByText('123456', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Generate new login code' }).click()
    await expect(page.getByText('654321', { exact: true })).toBeVisible()
    expect(state.codes).toBe(1)
    await name.fill('Name Only Correction')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByText('Patient details saved.', { exact: true })).toBeVisible()
    await expect(page.getByText('654321', { exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath('setup-correction.png'), fullPage: true })
    await page.reload(); await expect(name).toHaveValue('Name Only Correction')
    await page.getByRole('link', { name: 'Back to Patients', exact: true }).click()
    state.status = 'code_expired'
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByText('Code expired', { exact: true })).toBeVisible()
    state.setupComplete = true
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(page.getByText('No patients awaiting setup.')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}

test('setup errors preserve drafts, repair accounts, and stop editing after sign-in', async ({ context, page }) => {
  const state = await setupFlow(context)
  await page.goto('/dashboard')
  state.failLoad = true
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('button', { name: 'Retry setup' })).toBeVisible()
  state.failLoad = false
  await page.getByRole('button', { name: 'Retry setup' }).click()
  await page.getByRole('link', { name: state.name, exact: true }).click()
  const email = page.getByRole('textbox', { name: 'Email address' })
  await email.fill('collision@example.invalid'); state.failSave = 'EMAIL_CONFLICT'
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByText(/That email is already associated/)).toBeVisible()
  await expect(email).toHaveValue('collision@example.invalid')
  await expect(page.locator('body')).not.toContainText('private diagnostic')
  state.failSave = 'RECONCILIATION_REQUIRED'
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByText(/Save the correct details again to synchronize/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Generate new login code' })).toBeDisabled()
  state.failSave = null
  await email.fill('correct@example.invalid')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Generate new login code' })).toBeEnabled()
  await email.fill('another@example.invalid'); state.failSave = 'SETUP_COMPLETE'
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Email address' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Open patient care page' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to Patients', exact: true }).click()
  await expect(page.getByText('No patients awaiting setup.')).toBeVisible()
})


test('visible dashboard polls onboarding status every thirty seconds', async ({ context, page }) => {
  const state = await setupFlow(context)
  await page.clock.install()
  await page.goto('/dashboard')
  await expect(page.getByText('Awaiting code entry', { exact: true })).toBeVisible()
  const reads = state.reads
  state.status = 'code_expired'
  await page.clock.fastForward(30001)
  await expect(page.getByText('Code expired', { exact: true })).toBeVisible()
  expect(state.reads).toBeGreaterThan(reads)
})
