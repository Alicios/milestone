import { test, expect } from '@playwright/test'
import { setup, patient, profile, routineA } from './fixture.mjs'

const assignment = { id: 'rated-assignment', patient_profile_id: profile, routine_id: routineA, scheduled_date: '2026-10-20', status: 'scheduled', routine_name_snapshot: 'Patient-rated routine' }
const snapshots = [1, 2, 3, 4].map((index) => ({ id: `snapshot-${index}`, routine_assignment_id: assignment.id, exercise_name_snapshot: 'Repeated stretch', position: index - 1, sets_snapshot: 3, reps_snapshot: 12, timer_seconds_snapshot: 45, notes_snapshot: 'Provider instruction' }))
const exerciseFeedback = [1, 2, 3].map((index) => ({ routine_assignment_exercise_id: `snapshot-${index}`, pain_score: [2, 6, 9][index - 1], feeling: ['good', 'neutral', 'difficult'][index - 1], explanation: index === 1 ? null : 'Needed a break.\nPlease review <stretch>.', reported_at: '2026-11-03T18:00:00Z' }))

async function navigate(page, path) {
  await page.evaluate((path) => { history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate')) }, path)
}
for (const width of [1280, 390]) for (const theme of ['light', 'dark']) {
  test(`exercise pain is independent of routine colors at ${width}px ${theme}`, async ({ context, page }, info) => {
    const state = await setup(context, { assignments: [assignment], snapshots, exerciseFeedback })
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/dashboard/settings')
    await page.getByRole('radio', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true }).check()
    await navigate(page, `/dashboard/patients/${patient}`)
    await expect(page.locator('[data-routine-status="neutral"]')).toContainText('Patient-rated routine')
    await page.getByRole('button', { name: /View assigned routine Patient-rated routine/ }).click()
    await expect(page.getByText('Repeated stretch · 3 sets · 12 reps', { exact: true })).toHaveCount(4)
    const exerciseBoxes = page.getByRole('region', { name: 'Assigned exercise: Repeated stretch', exact: true })
    await expect(exerciseBoxes).toHaveCount(4)
    await expect(exerciseBoxes.nth(0).getByLabel('Pain: 2 out of 10')).toBeVisible()
    await expect(exerciseBoxes.nth(0).getByRole('region', { name: 'Patient exercise feedback', exact: true })).toHaveCSS('border-top-style', 'none')
    await expect(exerciseBoxes.nth(1).getByLabel('Pain: 6 out of 10')).toBeVisible()
    await expect(exerciseBoxes.nth(2).getByLabel('Pain: 9 out of 10')).toBeVisible()
    await expect(exerciseBoxes.nth(3)).toContainText('Patient pain: Not rated')
    await expect(page.getByText(/Provider instruction|45 seconds|Follow-up needs scheduling/)).toHaveCount(0)
    await expect(page.getByLabel('Pain: 2 out of 10')).toBeVisible()
    await expect(page.getByLabel('Pain: 6 out of 10')).toBeVisible()
    await expect(page.getByLabel('Pain: 9 out of 10')).toBeVisible()
    await expect(page.getByText('Patient pain: Not rated', { exact: true })).toHaveCount(1)
    const colors = await page.locator('[data-pain-score]').evaluateAll((items) => items.map((item) => getComputedStyle(item).backgroundColor))
    expect(new Set(colors).size).toBe(3)
    await expect(page.getByRole('region', { name: 'Patient exercise feedback' })).toHaveCount(3)
    await expect(page.getByText('Feeling: Neutral', { exact: true })).toBeVisible()
    await expect(page.getByText('Needed a break.\nPlease review <stretch>.', { exact: true })).toHaveCount(2)
    await expect(page.locator('stretch')).toHaveCount(0)
    await page.screenshot({ path: info.outputPath('patient-pain.png'), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.reload()
    await page.getByRole('button', { name: /View assigned routine Patient-rated routine/ }).click()
    await expect(page.getByLabel('Pain: 9 out of 10')).toBeVisible()
    await navigate(page, '/dashboard')
    await page.getByRole('button', { name: 'Expand weekly routines for Synthetic Browser Patient' }).click()
    const routine = page.getByRole('button', { name: /View assigned routine Patient-rated routine/ })
    await expect(routine).toHaveAttribute('data-routine-status', 'neutral')
    await routine.focus(); await page.keyboard.press('Enter')
    const details = page.getByRole('region', { name: 'Assigned routine details', exact: true })
    await expect(details.getByLabel('Pain: 9 out of 10')).toBeVisible()
    await expect(details.getByText('Provider notes', { exact: true })).toHaveCount(4)
    state.failExerciseFeedback = true
    await page.evaluate(() => dispatchEvent(new Event('focus')))
    await expect(details.getByRole('alert')).toContainText('Patient exercise feedback could not be loaded.')
    await expect(details.getByRole('heading', { name: 'Repeated stretch', exact: true })).toHaveCount(4)
    await expect(details.getByText('Patient pain: Not rated', { exact: true })).toHaveCount(0)
    await expect(details.locator('[data-pain-score]')).toHaveCount(0)
    state.failExerciseFeedback = false
    await details.getByRole('button', { name: 'Retry feedback', exact: true }).click()
    await expect(details.getByLabel('Pain: 9 out of 10')).toBeVisible()
    expect(state.writes).toHaveLength(0)
    expect(state.cancellations).toHaveLength(0)
  })
}
