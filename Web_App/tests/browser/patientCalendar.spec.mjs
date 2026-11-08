import { test, expect } from '@playwright/test'
import { setup, patient, profile, routineA, policy } from './fixture.mjs'

const patientName = 'Synthetic Browser Patient'
const longName = 'Gentle mobility and balance routine with a longer descriptive name'
const assignment = (id, name, status = 'scheduled') => ({ id, patient_profile_id: profile, routine_id: routineA,
  scheduled_date: '2026-10-20', status, routine_name_snapshot: name })

async function navigate(page, path) {
  await page.evaluate(path => { history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate')) }, path)
  await expect(page.getByRole('heading', { name: path === '/dashboard' ? 'Patients' : patientName, exact: true })).toBeVisible()
}

for (const width of [390, 768, 1365]) for (const theme of ['light', 'dark']) {
  test(`patient calendar rows, scrolling and actions at ${width}px ${theme}`, async ({ context, page }, info) => {
    await page.setViewportSize({ width, height: 1000 })
    const state = await setup(context, { assignments: [assignment('long', longName), assignment('second', 'Balance routine', 'completed'),
      assignment('cancelled', 'Cancelled routine', 'cancelled')], foreignDates: ['2026-10-21'] })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/dashboard/settings')
    await page.getByRole('radio', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true }).check()

    for (const view of ['dashboard', 'patient']) {
      await navigate(page, view === 'dashboard' ? '/dashboard' : `/dashboard/patients/${patient}`)
      if (view === 'dashboard') {
        await page.getByRole('button', { name: `Expand weekly routines for ${patientName}` }).click()
        await expect(page.locator(`#patient-week-${patient}`)).toHaveClass(/MuiCollapse-entered/)
      }
      const calendar = page.getByRole('region', { name: `Weekly calendar for ${patientName}`, exact: true })
      const scroller = calendar.getByRole('region', { name: `Days and routines for ${patientName}`, exact: true })
      const heading = calendar.getByRole('heading', { name: 'October 2026', exact: true })
      await expect(heading).toBeVisible()
      await expect(calendar.getByRole('columnheader')).toHaveCount(7)
      await expect(calendar.locator('[aria-current="date"] time')).toHaveAttribute('datetime', policy.today)
      await expect(calendar.getByRole('button', { name: /View assigned routine Cancelled/ })).toHaveCount(0)
      const cells = calendar.getByRole('cell')
      await expect(cells.nth(1).getByRole('button')).toHaveCount(2)
      await expect(cells.nth(2)).toContainText('Occupied')
      await expect(cells.nth(2).getByRole('button')).toHaveCount(0)
      await expect(cells.nth(0).getByRole('button')).toBeDisabled()
      await expect(cells.nth(3).getByRole('button')).toBeEnabled()
      const geometry = await calendar.locator('table').evaluate(table => {
        const headers = [...table.querySelectorAll('th')].map(el => el.getBoundingClientRect())
        const cells = [...table.querySelectorAll('td')].map(el => el.getBoundingClientRect())
        return headers.map((header, index) => ({ width: header.width, offset: header.x - cells[index].x,
          widthDifference: header.width - cells[index].width, below: cells[index].y >= header.bottom }))
      })
      for (const column of geometry) {
        expect(column.width).toBeGreaterThanOrEqual(111.5)
        expect(Math.abs(column.offset)).toBeLessThan(1)
        expect(Math.abs(column.widthDifference)).toBeLessThan(1)
        expect(column.below).toBe(true)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await scroller.scrollIntoViewIfNeeded()
      await scroller.evaluate(el => { el.scrollLeft = 0 })
      if (await scroller.evaluate(el => el.scrollWidth > el.clientWidth)) {
        const before = await heading.boundingBox()
        await scroller.focus()
        await page.keyboard.press('ArrowRight')
        await expect.poll(() => scroller.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
        const after = await heading.boundingBox()
        expect(Math.abs(after.x - before.x)).toBeLessThan(1)
        await scroller.evaluate(el => { el.scrollLeft = 0 })
      }
      const routine = calendar.getByRole('button', { name: `View assigned routine ${longName} on ${policy.today}`, exact: true })
      await routine.focus()
      await page.keyboard.press('Enter')
      await expect(routine).toHaveAttribute('aria-expanded', 'true')
      await expect(page.locator(`#${await routine.getAttribute('aria-controls')}`)).toContainText(longName)
      await routine.press('Enter')
      await expect(routine).toHaveAttribute('aria-expanded', 'false')
      await scroller.focus()
      await expect(calendar.locator('.MuiTouchRipple-ripple')).toHaveCount(0)
      await scroller.evaluate(el => { el.scrollLeft = 0 })
      await calendar.screenshot({ path: info.outputPath(`${view}-${width}-${theme}.png`) })
      await cells.nth(3).getByRole('button').click()
      const dialog = page.getByRole('dialog', { name: 'Schedule routine', exact: true })
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: 'Close', exact: true }).click()
      await page.getByRole('button', { name: 'Next calendar week' }).click()
      await expect(calendar.getByRole('heading', { name: 'October–November 2026', exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'This week', exact: true }).click()
      await expect(heading).toBeVisible()
    }
    expect(errors).toEqual([])
    expect(state.writes).toHaveLength(0)
  })
}

test('calendar month heading spans years without shifting dates in another timezone', async ({ context, page }) => {
  await setup(context)
  await context.route('**/rest/v1/rpc/get_routine_scheduling_policy', route => route.fulfill({ json: {
    ...policy, today: '2026-12-30', lastDate: '2027-01-12',
  } }))
  await page.goto(`/dashboard/patients/${patient}`)
  const calendar = page.getByRole('region', { name: `Weekly calendar for ${patientName}`, exact: true })
  await expect(calendar.getByRole('heading', { name: 'December 2026–January 2027', exact: true })).toBeVisible()
  await expect(calendar.locator('time').first()).toHaveAttribute('datetime', '2026-12-28')
  await expect(calendar.locator('time').last()).toHaveAttribute('datetime', '2027-01-03')
  await page.getByRole('button', { name: 'Previous calendar week' }).click()
  await expect(calendar.getByRole('heading', { name: 'December 2026', exact: true })).toBeVisible()
})
