import { test, expect } from '@playwright/test'
import { setup, patient, profile } from './fixture.mjs'

const newPatient = '00000000-0000-0000-0000-000000000080'
const newProfile = '00000000-0000-0000-0000-000000000081'

// Exercise the real UI/client against an isolated transport fixture. No live
// accounts or login codes are created by these browser tests.
async function onboarding(context, options = {}) {
  await setup(context)
  const state = { creates: [], invites: [], rows: [], failCreate: false, failInvite: false, ...options }
  await context.route('**/rest/v1/provider_patient_profiles?*', route => route.fulfill({ json: [
    { id: profile, patient_id: patient }, ...state.rows.map((row, index) => ({ id: index === 0 ? newProfile : `00000000-0000-0000-0000-${String(100 + index).padStart(12, '0')}`, patient_id: row.id })),
  ] }))
  await context.route('**/rest/v1/patients?*', route => route.fulfill({ json: [
    { id: patient, name: 'Synthetic Browser Patient', care_status: 'active' }, ...state.rows,
  ] }))
  await context.route('**/rest/v1/rpc/create_patient', async route => {
    const args = route.request().postDataJSON()
    state.creates.push(args)
    if (state.failCreate) return route.fulfill({ status: 403, json: { code: '42501', message: 'Synthetic creation rejection' } })
    const id = `00000000-0000-0000-0000-${String(80 + state.rows.length).padStart(12, '0')}`
    state.rows.push({ id, name: args.patient_name, email: args.patient_email, care_status: 'pending' })
    return route.fulfill({ json: id })
  })
  await context.route('**/api/invite-patient', async route => {
    state.invites.push(route.request().postDataJSON())
    expect(route.request().headers().authorization).toMatch(/^Bearer /)
    if (state.failInvite) return route.fulfill({ status: 502, json: { error: 'Synthetic invitation rejection' } })
    const row = state.rows.find(row => row.id === route.request().postDataJSON().patientId)
    row.pending_otp_code = '123456'
    row.pending_otp_expires_at = '2099-01-01T00:00:00Z'
    return route.fulfill({ json: { email: row.email, otp: '123456', expiresAt: '2099-01-01T00:00:00Z' } })
  })
  return state
}

for (const width of [390, 1365]) {
  test(`add patient, relay code, open care page and refresh list at ${width}px`, async ({ context, page }, info) => {
    const state = await onboarding(context)
    await page.setViewportSize({ width, height: 900 })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/dashboard')
    await expect(page.getByRole('link', { name: /Synthetic Browser Patient/ })).toBeVisible()
    await page.screenshot({ path: info.outputPath('patients-add-button.png'), fullPage: true })
    await page.getByRole('link', { name: 'Add patient', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Add patient', exact: true })).toBeVisible()
    const name = page.getByRole('textbox', { name: 'Patient name' })
    const email = page.getByRole('textbox', { name: 'Patient email' })
    await expect(name).toBeFocused()
    await expect(page.getByRole('button', { name: 'Create & Invite Patient' })).toBeDisabled()
    await name.fill('  New Synthetic Patient  ')
    await email.fill('invalid')
    await page.getByRole('button', { name: 'Create & Invite Patient' }).click()
    expect(await email.evaluate(input => input.validity.valid)).toBe(false)
    expect(state.creates).toHaveLength(0)
    await email.fill('new-patient@example.invalid')
    await page.screenshot({ path: info.outputPath('add-patient-form.png'), fullPage: true })
    await page.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit() })
    await expect(page.getByRole('heading', { name: 'Pending account created' })).toBeVisible()
    await expect(page.getByText('123456', { exact: true })).toBeVisible()
    expect(state.creates).toEqual([{ patient_name: 'New Synthetic Patient', patient_phone: null, patient_email: 'new-patient@example.invalid' }])
    expect(state.invites).toEqual([{ patientId: newPatient }])
    await page.screenshot({ path: info.outputPath('patient-added.png'), fullPage: true })
    await page.getByRole('link', { name: 'Open patient page' }).click()
    await expect(page.getByRole('heading', { name: 'New Synthetic Patient', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit patient details' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Schedule week', exact: true })).toBeEnabled()
    await page.getByRole('link', { name: 'Back to Patients', exact: true }).click()
    await expect(page.getByRole('link', { name: /New Synthetic Patient/ })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('link', { name: /New Synthetic Patient/ })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}

test('cancel, reset, creation retry and invitation recovery preserve the saved patient', async ({ context, page }, info) => {
  const state = await onboarding(context, { failCreate: true })
  await page.goto('/dashboard/patients/new')
  await page.getByRole('link', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Patients', exact: true })).toBeVisible()
  expect(state.creates).toHaveLength(0)
  await page.getByRole('link', { name: 'Add patient', exact: true }).click()
  await page.getByRole('textbox', { name: 'Patient name' }).fill('New Synthetic Patient')
  await page.getByRole('textbox', { name: 'Patient email' }).fill('new-patient@example.invalid')
  await page.getByRole('button', { name: 'Create & Invite Patient' }).click()
  await expect(page.getByRole('alert')).toContainText('You do not have permission')
  expect(state.invites).toHaveLength(0)
  state.failCreate = false; state.failInvite = true
  await page.getByRole('button', { name: 'Create & Invite Patient' }).click()
  await expect(page.getByRole('heading', { name: 'Patient saved, code unconfirmed' })).toBeVisible()
  await expect(page.getByText(/do not create this patient again/)).toBeVisible()
  await page.screenshot({ path: info.outputPath('patient-code-recovery.png'), fullPage: true })
  await page.getByRole('link', { name: 'Open patient page' }).click()
  await expect(page.getByRole('heading', { name: 'New Synthetic Patient', exact: true })).toBeVisible()
  state.failInvite = false
  await page.getByRole('button', { name: 'Invite to App', exact: true }).click()
  await expect(page.getByText('123456', { exact: true })).toBeVisible()
  expect(state.creates).toHaveLength(2) // One rejected attempt and one saved patient.
  expect(state.rows).toHaveLength(1)
  expect(state.invites).toHaveLength(2) // One failed code request and one retry.
  await page.goto('/dashboard/patients/new')
  await page.getByRole('textbox', { name: 'Patient name' }).fill('Another Synthetic Patient')
  await page.getByRole('textbox', { name: 'Patient email' }).fill('another@example.invalid')
  await page.getByRole('button', { name: 'Create & Invite Patient' }).click()
  await page.getByRole('button', { name: 'Add another patient', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Patient name' })).toHaveValue('')
  await expect(page.getByRole('textbox', { name: 'Patient email' })).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Create & Invite Patient' })).toBeDisabled()
})
