import { test, expect } from '@playwright/test'
import { setup, patient, profile, routineA } from './fixture.mjs'

const assignments = [
  ['past', 'scheduled', '2026-10-19'], ['complete', 'completed', '2026-10-19'],
  ['today', 'scheduled', '2026-10-20'], ['modified', 'modified', '2026-10-21'],
  ['cancelled', 'cancelled', '2026-10-22'],
].map(([id, status, date]) => ({ id, status, scheduled_date: date, patient_profile_id: profile, routine_id: routineA, routine_name_snapshot: `Routine ${id}` }))
Object.assign(assignments.find((row) => row.id === 'complete'), {
  patient_comment: 'I completed the routine and it felt manageable.', patient_in_progress: false, patient_result_source: 'demo',
})
assignments.push({ id: 'difficulty', status: 'completed', scheduled_date: '2026-10-22', patient_profile_id: profile, routine_id: routineA, routine_name_snapshot: 'Routine difficulty',
  patient_in_progress: false, patient_issue_severity: 'noncritical', patient_result_source: 'demo',
  patient_comment: 'I finished, but balance was difficult.\nPlease review <exercise> next visit.' })

async function go(page, path) {
  // SPA navigation retains the provider's appearance preference.
  await page.evaluate((path) => { history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')) }, path)
}

for (const width of [1280, 390]) for (const theme of ['light', 'dark']) {
  test(`routine colors, filters, preview and details at ${width}px ${theme}`, async ({ context, page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    const state = await setup(context, { assignments: structuredClone(assignments) })
    await page.goto('/dashboard/settings')
    await page.getByRole('radio', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true }).check()
    await go(page, '/dashboard')
    await expect(page.getByRole('region', { name: 'Routine status legend' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Expand weekly routines for Synthetic Browser Patient' }).click()
    const missed = page.getByRole('button', { name: 'View assigned routine Routine past on 2026-10-19', exact: true })
    await expect(page.locator('.MuiCollapse-root').filter({ has: missed })).toHaveClass(/MuiCollapse-entered/)
    await expect(missed).toHaveAttribute('data-routine-status', 'missed')
    await expect(missed).toHaveAccessibleDescription('Missed routine')
    await expect(page.getByRole('button', { name: /View assigned routine Routine complete/ })).toHaveAttribute('data-routine-status', 'completed')
    await expect(page.getByRole('button', { name: /View assigned routine Routine today/ })).toHaveAttribute('data-routine-status', 'neutral')
    await expect(page.getByRole('button', { name: /View assigned routine Routine modified/ })).toContainText('Modified')
    await expect(page.getByRole('button', { name: /View assigned routine Routine cancelled/ })).toHaveCount(0)
    await missed.focus(); await page.keyboard.press('Enter')
    await expect(page.getByRole('region', { name: 'Assigned routine details', exact: true })).toContainText('Missed routine')
    await expect(page.getByRole('region', { name: 'Routine status legend' })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true })
    await page.getByRole('button', { name: 'Collapse weekly routines for Synthetic Browser Patient' }).click()
    await expect(page.getByRole('region', { name: 'Routine status legend' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Expand weekly routines for Synthetic Browser Patient' }).click()
    await expect(page.getByRole('region', { name: 'Routine status legend' })).toBeVisible()
    await page.getByRole('button', { name: 'Filter', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Missed routine', exact: true }).click()
    await expect(missed).toBeVisible()
    await page.getByRole('button', { name: 'Filter', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Critical issue reported', exact: true }).click()
    await expect(page.getByText('No patients found', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Filter', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Patient reported an issue', exact: true }).click()
    const difficulty = page.getByRole('button', { name: /View assigned routine Routine difficulty/ })
    await expect(difficulty).toHaveAttribute('data-routine-status', 'issue')
    await difficulty.focus(); await page.keyboard.press('Enter')
    const feedback = page.getByRole('region', { name: 'Patient routine feedback', exact: true })
    await expect(feedback).toContainText('Patient feedback')
    await expect(feedback).not.toContainText('Demo result')
    await expect(feedback).not.toContainText('Sample patient comment')
    await expect(feedback).toContainText('Difficulty reported')
    await expect(feedback).toContainText('Routine completed')
    await expect(feedback).toContainText('Please review <exercise> next visit.')
    await expect(feedback.locator('exercise')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('dashboard-feedback.png'), fullPage: true })

    await go(page, `/dashboard/patients/${patient}`)
    await expect(page.locator('[data-routine-status="missed"]')).toContainText('Routine past')
    await expect(page.locator('[data-routine-status="completed"]')).toContainText('Routine complete')
    await page.getByRole('button', { name: /View assigned routine Routine difficulty/ }).click()
    const difficultyCard = page.locator('#patient-assignment-details [data-routine-status="issue"]')
    await expect(difficultyCard).toContainText('Routine difficulty')
    await expect(difficultyCard.getByRole('region', { name: 'Patient routine feedback' })).toContainText('Please review <exercise> next visit.')
    await expect(difficultyCard.getByRole('textbox')).toHaveCount(0)
    await expect(page.getByText('Routine cancelled', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Routine status legend' })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('patient.png'), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

    await page.reload()
    await page.getByRole('button', { name: /View assigned routine Routine difficulty/ }).click()
    await expect(page.locator('#patient-assignment-details [data-routine-status="issue"]')).toContainText('Please review <exercise> next visit.')

    await go(page, '/dashboard/routine-status-preview')
    await expect(page.getByRole('heading', { name: 'Routine status preview', exact: true })).toBeVisible()
    await expect(page.getByText(/sample data only|development preview/i)).toHaveCount(0)
    const buttons = page.getByRole('button', { name: /^View assigned routine / })
    await expect(buttons).toHaveCount(6)
    await page.mouse.move(0, 0)
    const colors = await buttons.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor))
    expect(new Set(colors).size).toBe(6)
    const cardColors = await page.locator('.MuiCard-root[data-routine-status]').evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor))
    // Wait for hover transitions left by navigation before comparing base colors.
    await expect.poll(() => buttons.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor))).toEqual(cardColors)
    await buttons.nth(5).focus(); await page.keyboard.press('Enter')
    await expect(page.getByRole('region', { name: 'Assigned routine details', exact: true })).toContainText('Critical issue reported')
    await page.screenshot({ path: testInfo.outputPath('preview.png'), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(state.writes).toHaveLength(0)
    expect(state.cancellations).toHaveLength(0)
  })
}
