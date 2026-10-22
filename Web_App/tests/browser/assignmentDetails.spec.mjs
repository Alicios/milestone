import { test, expect } from '@playwright/test'
import { setup, patient, profile, routineA, exercise } from './fixture.mjs'

const assignmentId = 'synthetic-assignment'
const assignment = { id: assignmentId, patient_profile_id: profile, routine_id: routineA,
  scheduled_date: '2026-10-21', status: 'scheduled', routine_name_snapshot: 'Bulletproof Back' }
const snapshots = [
  { id: 'third', routine_assignment_id: assignmentId, position: 2, exercise_name_snapshot: 'Captured stretch',
    sets_snapshot: 1, reps_snapshot: null, timer_seconds_snapshot: 45, notes_snapshot: null },
  { id: 'first', routine_assignment_id: assignmentId, position: 0, exercise_id_snapshot: exercise, exercise_name_snapshot: 'Captured bridge',
    sets_snapshot: 3, reps_snapshot: 12, timer_seconds_snapshot: 30, notes_snapshot: 'Slow movement\nKeep breathing' },
  { id: 'second', routine_assignment_id: assignmentId, position: 1, exercise_name_snapshot: 'Historical exercise' },
]
const details = (page) => page.getByRole('region', { name: 'Assigned routine details', exact: true })
const routineButton = (page) => page.getByRole('button', { name: 'View assigned routine Bulletproof Back on 2026-10-21', exact: true })
async function openWeek(page) {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Expand weekly routines for Synthetic Browser Patient' }).click()
  await expect(routineButton(page)).toBeVisible()
}
async function assertPrescription(page) {
  const panel = details(page)
  await expect(panel.getByRole('heading', { name: 'Bulletproof Back', exact: true })).toBeVisible()
  await expect(panel.locator('time')).toHaveText('Wednesday, October 21, 2026')
  await expect(panel.getByRole('listitem').getByRole('heading')).toHaveText(['Captured bridge', 'Historical exercise', 'Captured stretch'])
  await expect(panel.getByRole('listitem').nth(0).locator('dd')).toHaveText(['3', '12', '30 seconds', 'Slow movement\nKeep breathing'])
  await expect(panel.getByRole('listitem').nth(1).locator('dd')).toHaveText(Array(4).fill('Not specified'))
  await expect(panel.getByRole('listitem').nth(2).locator('dd')).toHaveText(['1', 'Not specified', '45 seconds', 'Not specified'])
  await expect(panel.getByRole('textbox')).toHaveCount(0)
}

for (const width of [1280, 390]) {
  test(`assigned details use ordered snapshots after a template edit and remain collapsible at ${width}px`, async ({ context, page }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await setup(context, { assignments: [structuredClone(assignment)], snapshots: structuredClone(snapshots) })
    await openWeek(page)
    await expect(page.getByRole('button', { name: /Assign routine to .* on Wednesday/ })).toHaveCount(0)
    await expect(page.getByText('Add another', { exact: true })).toHaveCount(0)
    await routineButton(page).focus()
    await page.keyboard.press('Enter')
    await expect(routineButton(page)).toHaveAttribute('aria-expanded', 'true')
    await assertPrescription(page)
    const panelBounds = await details(page).boundingBox()
    expect(panelBounds.x).toBeGreaterThanOrEqual(0)
    expect(panelBounds.x + panelBounds.width).toBeLessThanOrEqual(width)
    await details(page).getByRole('button', { name: 'Collapse details' }).click()
    await expect(details(page)).toHaveCount(0)
    await routineButton(page).click()
    await routineButton(page).click()
    await expect(details(page)).toHaveCount(0)

    // Exercise the real editor against the isolated transport fixture only.
    await page.goto('/dashboard/routines')
    await page.getByRole('button', { name: 'Edit Routine', exact: true }).click()
    await page.getByText('Catalog A', { exact: true }).click()
    await page.getByRole('textbox', { name: 'Routine name', exact: true }).fill('Changed template')
    await page.getByLabel('Sets — exercise 1', { exact: true }).fill('99')
    await page.getByLabel('Reps — exercise 1', { exact: true }).fill('88')
    await page.getByLabel('Duration (seconds) — exercise 1', { exact: true }).fill('77')
    await page.getByLabel('Notes — exercise 1', { exact: true }).fill('New template notes')
    await page.getByRole('button', { name: 'Finish Editing', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Routine name', exact: true })).toHaveCount(0)
    expect(state.routines.find((r) => r.id === routineA).exercise_list[0].sets).toBe(99)
    await openWeek(page)
    await routineButton(page).click()
    await assertPrescription(page)
    await expect(details(page).getByText('New template notes', { exact: true })).toHaveCount(0)
    expect(state.snapshots).toEqual(snapshots)
    expect(state.assignments).toEqual([assignment])

    await page.getByRole('button', { name: 'Collapse weekly routines for Synthetic Browser Patient' }).click()
    await page.getByRole('button', { name: 'Expand weekly routines for Synthetic Browser Patient' }).click()
    await expect(details(page)).toHaveCount(0)
    await routineButton(page).click()
    await page.getByRole('button', { name: 'Next calendar week' }).click()
    await expect(details(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Previous calendar week' }).click()
    await expect(routineButton(page)).toHaveAttribute('aria-expanded', 'false')
    expect(state.writes).toHaveLength(0)
    expect(state.cancellations).toHaveLength(0)
  })
}

test('snapshot refresh shows loading, hides old data on errors, and retries read-only', async ({ context, page }) => {
  const state = await setup(context, { assignments: [assignment], snapshots })
  await openWeek(page)
  await routineButton(page).click()
  await assertPrescription(page)
  let release
  const pending = new Promise((resolve) => { release = resolve })
  state.holdSnapshots = () => pending
  state.failSnapshots = true
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(details(page).getByRole('status')).toHaveText('Loading assigned routine details…')
  await expect(details(page).getByText('Captured bridge', { exact: true })).toHaveCount(0)
  release()
  await expect(details(page).getByRole('alert')).toContainText('Unable to load assigned routine details')
  await expect(details(page).getByText('Captured bridge', { exact: true })).toHaveCount(0)
  state.holdSnapshots = null
  state.failSnapshots = false
  await details(page).getByRole('button', { name: 'Retry details' }).click()
  await assertPrescription(page)
  expect(state.writes).toHaveLength(0)
  expect(state.cancellations).toHaveLength(0)
})

test('empty snapshots never fall back to template exercises and removed assignments clear details', async ({ context, page }) => {
  const state = await setup(context, { assignments: [assignment], snapshots: [] })
  await openWeek(page)
  await routineButton(page).click()
  await expect(details(page).getByRole('status')).toHaveText('No exercise details were recorded for this assignment.')
  await expect(details(page).getByText('Catalog exercise', { exact: true })).toHaveCount(0)
  state.assignments = []
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(details(page).getByRole('alert')).toHaveText('This assignment is no longer available in this week.')
  await expect(details(page).getByRole('heading', { name: 'Bulletproof Back', exact: true })).toHaveCount(0)
  expect(state.writes).toHaveLength(0)
})

test('sign-out discards the open prescription panel', async ({ context, page }) => {
  await setup(context, { assignments: [assignment], snapshots })
  await openWeek(page)
  await routineButton(page).click()
  await assertPrescription(page)
  await page.getByRole('button', { name: 'Open profile menu' }).click()
  await page.getByRole('menuitem', { name: 'Logout', exact: true }).click()
  await expect(details(page)).toHaveCount(0)
  await expect(page.getByText('Captured bridge', { exact: true })).toHaveCount(0)
})
