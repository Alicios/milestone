import { test, expect } from '@playwright/test'
import { setup, patient, profile, routineA, session } from './fixture.mjs'

// Opt-in: serve a fresh Expo web export and set MILESTONE_MOBILE_EXPORT_URL.
const mobileUrl = process.env.MILESTONE_MOBILE_EXPORT_URL
const uid = '00000000-0000-0000-0000-000000000040'
const assignmentId = '00000000-0000-0000-0000-000000000050'
const snapshots = [1, 2].map((number) => ({ id: `00000000-0000-0000-0000-00000000006${number}`, routine_assignment_id: assignmentId,
  exercise_name_snapshot: 'Repeated stretch', position: number - 1, sets_snapshot: 1, reps_snapshot: 5, timer_seconds_snapshot: null, notes_snapshot: 'Provider instruction' }))
test.skip(!mobileUrl, 'Set MILESTONE_MOBILE_EXPORT_URL to a locally served mobile export')

for (const width of [1280, 390]) for (const theme of ['light', 'dark']) {
  test(`mobile pain saves and provider sees it at ${width}px ${theme}`, async ({ browser }, info) => {
    const providerContext = await browser.newContext()
    const providerState = await setup(providerContext, { assignments: [{ id: assignmentId, patient_profile_id: profile, routine_id: routineA, scheduled_date: '2026-10-20', status: 'scheduled', routine_name_snapshot: 'Rated routine' }], snapshots })
    const mobileContext = await browser.newContext({ viewport: { width, height: 950 }, timezoneId: 'America/Los_Angeles' })
    try {
      const auth = { ...session, user: { ...session.user, id: uid, email: 'patient@example.invalid' } }
      auth.access_token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: uid, exp: 4102444800, role: 'authenticated' })).toString('base64url'), 'fixture'].join('.')
      await mobileContext.addInitScript(({ uid, auth, theme }) => {
        localStorage.setItem('sb-lwldkhrsngwtuhztlmul-auth-token', JSON.stringify(auth))
        localStorage.setItem(`milestone.patient-local.v1.${uid}`, JSON.stringify({ preferredName: '', dateOfBirth: '', pin: null, photoUri: null, preferences: { appearance: theme } }))
      }, { uid, auth, theme })
      await mobileContext.routeWebSocket('wss://**', (socket) => socket.close())
      let attempts = 0
      let failSave = true
      let failRead = true
      await mobileContext.route('**/*', async (route) => {
        const url = new URL(route.request().url())
        if (url.origin === mobileUrl) return route.continue()
        if (url.hostname !== 'lwldkhrsngwtuhztlmul.supabase.co') return route.abort()
        const body = route.request().postDataJSON() || {}
        const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
        if (url.pathname.includes('/auth/')) return reply(url.pathname.endsWith('/user') ? auth.user : auth)
        const name = url.pathname.split('/').at(-1)
        if (name === 'get_my_patient_profile') return reply([{ id: patient, name: 'Synthetic Patient', email: 'patient@example.invalid', care_status: 'active' }])
        if (name === 'get_my_care_relationships') return reply([{ patient_profile_id: profile }])
        if (name === 'get_my_routine_assignments') return reply([{ id: assignmentId, status: 'scheduled', scheduled_date: '2026-10-20', created_at: '2026-10-19T18:00:00Z', routine_name_snapshot: 'Rated routine' }])
        if (name === 'get_my_routine_assignment_prescriptions') return reply(snapshots.map((row) => ({ ...row, exercise_position: row.position })))
        if (name === 'get_my_routine_exercise_feedback') return failRead ? reply({ code: '08006', message: 'Feedback unavailable' }, 400) : reply(providerState.exerciseFeedback)
        if (name === 'get_my_message_inbox' || name === 'clear_my_pending_otp') return reply([])
        if (name === 'save_my_routine_exercise_feedback') {
          attempts++
          if (failSave) return reply({ code: '08006', message: 'Unable to connect. Please retry.' }, 400)
          const row = { routine_assignment_exercise_id: body.p_routine_assignment_exercise_id, pain_score: body.p_pain_score,
            feeling: body.p_feeling, explanation: body.p_explanation, reported_at: '2026-10-20T18:00:00Z' }
          providerState.exerciseFeedback = [...providerState.exerciseFeedback.filter((item) => item.routine_assignment_exercise_id !== row.routine_assignment_exercise_id), row]
          return reply([row])
        }
        throw new Error(`Unexpected mobile request: ${name}`)
      })
      const page = await mobileContext.newPage()
      await page.clock.setFixedTime(new Date('2026-10-20T18:00:00Z'))
      await page.goto(mobileUrl)
      await expect(page.getByText('0 of 2 exercises complete', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Start routine', exact: true }).click()
      await page.getByRole('button', { name: 'Start exercise', exact: true }).click()
      await page.getByRole('button', { name: 'Pause exercise', exact: true }).click()
      await page.getByRole('button', { name: 'Finish exercise', exact: true }).click()
      await expect(page.getByRole('alert')).toContainText('saved exercise responses could not be loaded')
      failRead = false
      await page.getByRole('button', { name: 'Retry saved exercise feedback', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Retry saved exercise feedback', exact: true })).toHaveCount(0)
      await page.getByRole('button', { name: 'Next exercise', exact: true }).click()
      await expect(page.getByRole('alert')).toContainText('Choose a pain score')
      expect(attempts).toBe(0)
      const pain = page.getByRole('button', { name: 'Pain 7 out of 10', exact: true })
      await pain.focus(); await page.keyboard.press('Enter')
      await page.getByRole('button', { name: 'Exercise felt neutral', exact: true }).click()
      await page.getByRole('button', { name: 'Next exercise', exact: true }).click()
      await expect(page.getByRole('alert')).toContainText('Tell your provider why')
      await page.getByRole('textbox', { name: 'Tell your provider why' }).fill('The balance felt difficult.\nPlease review it.')
      await page.screenshot({ path: info.outputPath('mobile-pain.png'), fullPage: true })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.getByRole('button', { name: 'Next exercise', exact: true }).click()
      await expect(page.getByRole('alert')).toContainText('Please retry')
      await expect(page.getByRole('textbox', { name: 'Tell your provider why' })).toHaveValue('The balance felt difficult.\nPlease review it.')
      failSave = false
      await page.getByRole('button', { name: 'Next exercise', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Start exercise', exact: true })).toBeVisible()
      expect(providerState.exerciseFeedback).toHaveLength(1)
      expect(providerState.exerciseFeedback[0].routine_assignment_exercise_id).toBe(snapshots[0].id)
      await page.reload()
      await expect(page.getByText('0 of 2 exercises complete', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Start routine', exact: true }).click()
      await page.getByRole('button', { name: 'Start exercise', exact: true }).click()
      await page.getByRole('button', { name: 'Pause exercise', exact: true }).click()
      await page.getByRole('button', { name: 'Finish exercise', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Pain 7 out of 10', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('textbox', { name: 'Tell your provider why' })).toHaveValue('The balance felt difficult.\nPlease review it.')
      const providerPage = await providerContext.newPage()
      await providerPage.goto(`http://127.0.0.1:4187/dashboard/patients/${patient}`)
      await expect(providerPage.getByLabel('Pain: 7 out of 10')).toBeVisible()
      await expect(providerPage.getByText('Patient pain: Not rated', { exact: true })).toHaveCount(1)
      await expect(providerPage.locator('[data-routine-status="neutral"]')).toContainText('The balance felt difficult.')
    } finally {
      await mobileContext.close(); await providerContext.close()
    }
  })
}
