import { test, expect } from '@playwright/test'
import { setup, patient, profile, routineA } from './fixture.mjs'

async function navigate(page, path) {
  await page.evaluate(path => { history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate')) }, path)
  if (path === '/dashboard/routines') await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveCount(0)
}

for (const width of [390, 1280]) {
  test(`patient routines refresh on return, history and tab visibility at ${width}px`, async ({ context, page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    const assignment = { id: 'mobile-completion', patient_profile_id: profile, routine_id: routineA,
      scheduled_date: '2026-10-20', status: 'scheduled', routine_name_snapshot: 'Mobile completed routine' }
    const state = await setup(context, { assignments: [assignment], snapshots: [{ id: 'rated-exercise',
      routine_assignment_id: assignment.id, exercise_name_snapshot: 'Gentle stretch', position: 0, sets_snapshot: 1, reps_snapshot: 5 }] })
    let failReads = false
    await page.route('**/rest/v1/routine_assignments?*', route => failReads
      ? route.fulfill({ status: 400, json: { code: 'XX000', message: 'Synthetic refresh failure' } })
      : route.fallback())
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const path = `/dashboard/patients/${patient}`
    await page.goto(path)
    await expect(page.locator('button[data-routine-status="neutral"]')).toContainText(assignment.routine_name_snapshot)
    const reads = state.reads.length
    await navigate(page, '/dashboard/routines')
    // Simulate the data persisted by the mobile feedback RPC while away.
    state.assignments[0] = { ...assignment, status: 'completed', patient_result_source: 'patient', patient_in_progress: false }
    state.exerciseFeedback = [{ routine_assignment_exercise_id: 'rated-exercise', pain_score: 3, feeling: 'good', explanation: null, reported_at: '2026-10-20T18:00:00Z' }]
    await navigate(page, path)
    await expect(page.locator('button[data-routine-status="completed"]')).toContainText(assignment.routine_name_snapshot)
    expect(state.reads.length).toBeGreaterThan(reads)
    await page.getByRole('button', { name: /View assigned routine Mobile completed routine/ }).click()
    await expect(page.getByLabel('Pain: 3 out of 10')).toBeVisible()
    await navigate(page, '/dashboard/routines')
    state.assignments[0].patient_in_progress = true
    state.assignments[0].status = 'scheduled'
    await page.goBack()
    await expect(page.locator('button[data-routine-status="inProgress"]')).toContainText(assignment.routine_name_snapshot)
    state.assignments[0].status = 'completed'
    state.assignments[0].patient_in_progress = false
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(page.locator('button[data-routine-status="completed"]')).toBeVisible()
    // A failed return refresh must show a retry, rather than stale completion.
    await navigate(page, '/dashboard/routines')
    failReads = true
    await navigate(page, path)
    await expect(page.getByRole('button', { name: 'Retry loading assignments' })).toBeVisible()
    await expect(page.locator('button[data-routine-status="completed"]')).toHaveCount(0)
    failReads = false
    await page.getByRole('button', { name: 'Retry loading assignments' }).click()
    await expect(page.locator('button[data-routine-status="completed"]')).toBeVisible()
    await page.screenshot({ path: info.outputPath(`patient-completed-${width}.png`), fullPage: true })
    expect(errors).toEqual([])
    expect(state.writes).toHaveLength(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
