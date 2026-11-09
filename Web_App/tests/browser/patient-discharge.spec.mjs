import { test, expect } from '@playwright/test'
import { setup, patient, profile } from './fixture.mjs'

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`discharged filter, retained history, reinstatement and reload at ${viewport.width}px`, async ({ context, page }) => {
    await page.setViewportSize(viewport)
    await setup(context)
    let discharged = true
    let failReinstatement = true
    let calls = 0
    await context.route('**/rest/v1/provider_patient_profiles?*', route => route.fulfill({
      contentType: 'application/json', body: JSON.stringify([{ id: profile, patient_id: patient,
        discharged_at: discharged ? '2026-11-08T12:00:00Z' : null,
        retention_ends_at: discharged ? '2027-05-08T12:00:00Z' : null }]),
    }))
    await context.route('**/rest/v1/rpc/reinstate_patient', async route => {
      calls++
      expect(route.request().postDataJSON()).toEqual({ patient_id: patient })
      if (failReinstatement) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0002', message: 'Retained discharged patient profile not found' }) })
      discharged = false
      await route.fulfill({ contentType: 'application/json', body: 'null' })
    })
    await page.goto('/dashboard/patients')
    await expect(page.getByText('No patients found', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Archive', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Archived patients', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /Synthetic Browser Patient/ })).toBeVisible()
    await expect(page.getByText(/Open a profile to review history/)).toBeVisible()
    await page.screenshot({ path: `test-results/discharged-list-${viewport.width}.png`, fullPage: true })
    await page.getByRole('link', { name: /Synthetic Browser Patient/ }).click()
    await expect(page.getByText('Discharged patient', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Schedule week', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Edit patient details' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Generate login code' })).toHaveCount(0)
    await page.screenshot({ path: `test-results/discharged-profile-${viewport.width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Reinstate patient', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: /not found|could not|no longer/i })).toBeVisible()
    await expect(page.getByText('Discharged patient', { exact: true })).toBeVisible()
    failReinstatement = false
    await page.getByRole('button', { name: 'Reinstate patient', exact: true }).click()
    await expect(page.getByText('Active patient', { exact: true })).toBeVisible()
    expect(calls).toBe(2)
    await page.reload()
    await expect(page.getByText('Active patient', { exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Back to Patients', exact: true }).click()
    await expect(page.getByRole('link', { name: /Synthetic Browser Patient/ })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

for (const width of [390, 1440]) {
  test(`current and discharged patients remain accessible before retention migration at ${width}px`, async ({ context, page }) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(context)
    let fallbackReads = 0
    const activeId = '00000000-0000-0000-0000-000000000012'
    await context.route('**/rest/v1/provider_patient_profiles?*', route => {
      const select = new URL(route.request().url()).searchParams.get('select')
      if (select.includes('retention_ends_at')) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '42703', message: 'column retention_ends_at does not exist' }) })
      fallbackReads++
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([
        { id: profile, patient_id: patient, discharged_at: '2026-11-08T12:00:00Z' },
        { id: '00000000-0000-0000-0000-000000000013', patient_id: activeId, discharged_at: null },
      ]) })
    })
    await context.route('**/rest/v1/patients?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([
      { id: patient, name: 'Discharged Patient', care_status: 'active' },
      { id: activeId, name: 'Current Patient', care_status: 'active' },
    ]) }))
    await page.goto('/dashboard/patients')
    await expect(page.getByRole('tab')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Archive', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('link', { name: /^Discharged Patient/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /^Current Patient/ })).toBeVisible()
    await page.getByRole('button', { name: 'Archive', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Archive', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('link', { name: /^Current Patient/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /^Discharged Patient/ })).toBeVisible()
    await page.getByRole('button', { name: 'Back to patients', exact: true }).click()
    await expect(page.getByRole('link', { name: /^Current Patient/ })).toBeVisible()
    await page.getByRole('button', { name: 'Archive', exact: true }).click()
    await expect(page.getByText('Invalid Date')).toHaveCount(0)
    await page.screenshot({ path: `test-results/discharged-tab-${width}.png`, fullPage: true })
    await page.getByRole('link', { name: /^Discharged Patient/ }).click()
    await expect(page.getByRole('heading', { name: 'Discharged Patient', exact: true })).toBeVisible()
    await expect(page.getByText(/You can review this patient's details/)).toBeVisible()
    await expect(page.getByText('Invalid Date')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Schedule week', exact: true })).toBeDisabled()
    expect(fallbackReads).toBeGreaterThan(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
