import { createHash, randomUUID } from 'node:crypto'
export const provider = '00000000-0000-0000-0000-000000000001'
export const patient = '00000000-0000-0000-0000-000000000010'
export const profile = '00000000-0000-0000-0000-000000000011'
export const exercise = '00000000-0000-0000-0000-000000000020'
export const routineA = '00000000-0000-0000-0000-000000000030'
export const routineB = '00000000-0000-0000-0000-000000000031'
export const policy = { today: '2026-10-20', lastDate: '2026-11-02', horizonDays: 14, timeZone: 'America/Los_Angeles' }
export const session = {
  access_token: [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: provider, exp: 4102444800, aal: 'aal1', role: 'authenticated' })).toString('base64url'), 'fixture'].join('.'),
  token_type: 'bearer', refresh_token: 'fixture-refresh', expires_in: 3600, expires_at: 4102444800,
  user: { id: provider, email: 'provider@example.invalid', aud: 'authenticated', role: 'authenticated', factors: [] },
}
const sessionKey = 'sb-scrum64-test-auth-token'
export const token = (routine) => createHash('sha256').update(JSON.stringify(routine)).digest('hex')

// In-memory transport fixture only. All external traffic is blocked. Real
// PostgreSQL behavior is exercised separately by scheduling_integration.py.
export async function setup(context, options = {}) {
  const state = {
    routines: [
      { id: routineA, name: 'Catalog A', exercise_list: [{ exercise_id: exercise, name: 'Catalog exercise', sets: 3, reps: 12, duration_seconds: 30, notes: 'Move slowly' }] },
      { id: routineB, name: 'Catalog B', exercise_list: [{ exercise_id: exercise, name: 'Catalog exercise', sets: 2, reps: 8, duration_seconds: null, notes: null }] },
    ],
    assignments: [], snapshots: [], receipts: new Map(), writes: [], previews: [], cancellations: [], reads: [],
    lostResponse: false, rejectBatch: null, failReload: false, failReceipt: false, cancelledResponseLost: false,
    foreignDates: [], holdRead: null, ...options,
  }
  await context.addInitScript(({ sessionKey, session }) => {
    if (!localStorage.getItem('fixture.initialized')) {
      localStorage.setItem(sessionKey, JSON.stringify(session)); localStorage.setItem('fixture.initialized', 'yes')
    }
  }, { sessionKey, session })
  await context.routeWebSocket('wss://**', (socket) => socket.close())
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1') return route.continue()
    if (url.hostname !== 'scrum64-test.supabase.co') return route.abort()
    const body = route.request().postDataJSON() || {}
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    const failure = (code, message) => reply({ code, message }, 400)
    if (url.pathname.includes('/auth/')) {
      if (url.pathname.endsWith('/logout')) return reply({})
      if (url.pathname.endsWith('/token')) return reply(session)
      return reply(session.user)
    }
    const name = url.pathname.split('/').at(-1)
    if (url.pathname.includes('/rpc/')) {
      if (name === 'get_routine_scheduling_policy') return reply(policy)
      if (name === 'get_patient_schedule_occupancy') return reply([
        ...state.assignments.filter((a) => a.status !== 'cancelled' && a.scheduled_date >= body.p_start_date && a.scheduled_date <= body.p_end_date)
          .map((a) => ({ date: a.scheduled_date, assignmentId: a.id, routineName: a.routine_name_snapshot })),
        ...state.foreignDates.filter((date) => date >= body.p_start_date && date <= body.p_end_date).map((date) => ({ date, assignmentId: null, routineName: null })),
      ])
      if (name === 'preview_routine_schedule') {
        state.previews.push(body)
        const entries = body.p_entries.map((entry) => {
          const routine = state.routines.find((item) => item.id === entry.routineId)
          return { ...entry, token: token(routine), routineName: routine.name,
            exercises: routine.exercise_list.map((e, position) => ({ name: e.name, exerciseId: e.exercise_id, position, sets: e.sets, reps: e.reps, durationSeconds: e.duration_seconds, notes: e.notes })) }
        })
        const occupied = [...state.assignments.filter((a) => a.status !== 'cancelled').map((a) => ({ date: a.scheduled_date, assignmentId: a.id, routineName: a.routine_name_snapshot })), ...state.foreignDates.map((date) => ({ date, assignmentId: null, routineName: null }))]
        return reply({ policy, entries, occupied, conflicts: occupied.filter((entry) => entries.some((selected) => selected.date === entry.date)) })
      }
      if (name === 'assign_routine_schedule') {
        state.writes.push(body)
        if (state.rejectBatch) return failure(state.rejectBatch, 'Batch rejected')
        let result = state.receipts.get(body.p_request_id)
        if (!result) {
          if (body.p_entries.some((entry) => token(state.routines.find((r) => r.id === entry.routineId)) !== entry.token)) return failure('40001', 'Routine changed')
          if (body.p_entries.some((entry) => state.foreignDates.includes(entry.date) || state.assignments.some((a) => a.status !== 'cancelled' && a.scheduled_date === entry.date))) return failure('23505', 'Date occupied')
          const assignments = body.p_entries.map((entry) => {
            const id = randomUUID(); const routine = state.routines.find((r) => r.id === entry.routineId)
            state.assignments.push({ id, patient_profile_id: profile, routine_id: routine.id, scheduled_date: entry.date, status: 'scheduled', routine_name_snapshot: routine.name })
            state.snapshots.push(...routine.exercise_list.map((e, position) => ({ id: randomUUID(), routine_assignment_id: id, exercise_name_snapshot: e.name, exercise_id_snapshot: e.exercise_id, position, sets_snapshot: e.sets, reps_snapshot: e.reps, timer_seconds_snapshot: e.duration_seconds, notes_snapshot: e.notes })))
            return { id, date: entry.date, routineId: entry.routineId }
          })
          result = { requestId: body.p_request_id, patientProfileId: profile, assignments }; state.receipts.set(body.p_request_id, result)
        }
        if (state.lostResponse) { state.lostResponse = false; return route.abort('connectionreset') }
        return reply(result)
      }
      if (name === 'get_routine_schedule_request') return state.failReceipt ? failure('42501', 'Receipt unavailable') : reply(state.receipts.get(body.p_request_id) ?? null)
      if (name === 'cancel_routine_assignment') {
        state.cancellations.push(body)
        const assignment = state.assignments.find((a) => a.id === body.p_routine_assignment_id)
        if (assignment) assignment.status = 'cancelled'
        if (state.cancelledResponseLost) { state.cancelledResponseLost = false; return route.abort('connectionreset') }
        return reply(null)
      }
      if (name === 'save_routine_prescriptions') {
        const routine = { id: body.p_routine_id || randomUUID(), name: body.p_routine_name, exercise_list: body.p_exercises.map((e) => ({ ...e, name: 'Catalog exercise' })) }
        state.routines = [...state.routines.filter((r) => r.id !== routine.id), routine]
        return reply(routine.id)
      }
      throw new Error(`Unexpected RPC: ${name}`)
    }
    if (name === 'providers') return reply({ id: provider, name: 'Fixture Provider', initials: 'FP', contact_email: 'provider@example.invalid' })
    if (name === 'provider_patient_profiles') return reply([{ id: profile, patient_id: patient }])
    if (name === 'patients') return reply([{ id: patient, name: 'Synthetic Browser Patient', care_status: 'active' }])
    if (name === 'routines') return reply(state.routines)
    if (name === 'exercises') return reply([{ id: exercise, name: 'Catalog exercise', desc: 'Fixture instructions' }])
    if (name === 'routine_assignments') {
      state.reads.push(url.search)
      const from = url.searchParams.getAll('scheduled_date').find((s) => s.startsWith('gte.'))?.slice(4)
      const to = url.searchParams.getAll('scheduled_date').find((s) => s.startsWith('lte.'))?.slice(4)
      const rows = structuredClone(state.assignments.filter((a) => a.status !== 'cancelled' && a.scheduled_date >= from && a.scheduled_date <= to))
      if (state.holdRead) await state.holdRead(from)
      if (state.failReload && state.writes.length) return failure('XX000', 'Reload failed')
      return reply(rows)
    }
    if (name === 'routine_assignment_exercises') return reply(state.snapshots)
    return reply([])
  })
  return state
}
