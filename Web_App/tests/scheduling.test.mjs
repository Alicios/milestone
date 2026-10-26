import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs, hooks, MemoryStorage, deferred, tick } from './helpers/modules.mjs'
const scheduling = loadTs('src/lib/scheduling.ts')
const { ScheduleRecovery, SingleFlight } = loadTs('src/lib/scheduleRecovery.ts')
const provider = '00000000-0000-0000-0000-000000000001'
const other = '00000000-0000-0000-0000-000000000002'
const profile = '00000000-0000-0000-0000-000000000010'
const routine = '00000000-0000-0000-0000-000000000020'
const request = '00000000-0000-0000-0000-000000000030'
const entries = [{ date: '2026-10-20', routineId: routine, token: 'a'.repeat(64) }]
const operation = { providerId: provider, patientProfileId: profile, requestId: request, entries }
const receipt = { requestId: request, patientProfileId: profile, assignments: [{ id: '00000000-0000-0000-0000-000000000040', date: entries[0].date, routineId: routine }] }
const policy = { today: '2026-10-20', lastDate: '2026-11-02', horizonDays: 14, timeZone: 'America/Los_Angeles' }

test('weekday pattern creates different dated routines; rest days create nothing', () => {
  assert.deepEqual(scheduling.weeklySelections('2026-10-19', ['A', 'B', 'A', '', 'C', 'B', ''], false, policy), [
    { date: '2026-10-20', routineId: 'B' }, { date: '2026-10-21', routineId: 'A' }, { date: '2026-10-23', routineId: 'C' }, { date: '2026-10-24', routineId: 'B' },
  ])
  assert.deepEqual(scheduling.weeklySelections('2026-10-19', Array(7).fill(''), true, policy), [])
})
test('finite repetition includes today and day 13, never day 14 or duplicate dates', () => {
  const dates = scheduling.weeklySelections('2026-10-19', Array(7).fill('A'), true, policy).map((entry) => entry.date)
  assert.equal(dates.length, 14); assert.equal(dates[0], policy.today); assert.equal(dates.at(-1), policy.lastDate)
  assert.equal(new Set(dates).size, dates.length)
  assert.equal(scheduling.weeklySelections('2026-11-09', ['A'], true, policy).length, 0)
  assert.equal(scheduling.weeklySelections('2026-10-26', Array(7).fill('A'), true, policy).length, 8)
})
test('date arithmetic and week navigation ignore browser timezones and both DST transitions', () => {
  for (const zone of ['UTC', 'America/Los_Angeles', 'Pacific/Auckland', 'Asia/Tokyo']) {
    process.env.TZ = zone
    assert.equal(scheduling.addDays('2026-03-08', 1), '2026-03-09')
    assert.equal(scheduling.addDays('2026-11-01', 1), '2026-11-02')
    assert.equal(scheduling.weekDatesFor('2027-01-01')[0], '2026-12-28')
    assert.equal(scheduling.weekDatesFor(scheduling.addDays('2026-10-19', -7))[6], '2026-10-18')
    assert.equal(scheduling.withinHorizon('2026-11-03', policy), false)
  }
})
test('calendar epochs reject stale responses and responses predating a mutation', () => {
  const epoch = new scheduling.RequestEpoch(); const first = epoch.next(); const next = epoch.next()
  assert.equal(first(), false); assert.equal(next(), true); epoch.invalidate(); assert.equal(next(), false)
})
test('provider-scoped recovery survives a new instance and keeps separate tab requests', () => {
  const storage = new MemoryStorage(); new ScheduleRecovery(storage).retain(operation)
  const second = { ...operation, requestId: '00000000-0000-0000-0000-000000000031' }
  new ScheduleRecovery(storage).retain(second)
  assert.deepEqual(new ScheduleRecovery(storage).list(provider), [operation, second])
  assert.deepEqual(new ScheduleRecovery(storage).list(other), [])
  assert.throws(() => new ScheduleRecovery(storage).retain({ ...operation, entries: [] }), /cannot be changed/)
  new ScheduleRecovery(storage).remove(operation)
  assert.deepEqual(new ScheduleRecovery(storage).list(provider), [second])
  assert.ok(!JSON.stringify([...storage.values]).includes('prescription'))
})
test('corrupt recovery records block new writes rather than being silently discarded', () => {
  const storage = new MemoryStorage(); new ScheduleRecovery(storage).retain(operation)
  storage.setItem(storage.key(0), '{}')
  assert.throws(() => new ScheduleRecovery(storage).list(provider), /damaged/)
  assert.equal(storage.length, 1)
})
test('synchronous single-flight guards rapid clicks, clears failures, permits explicit retry', async () => {
  const guard = new SingleFlight(); const wait = deferred(); let calls = 0
  const task = () => { calls++; return wait.promise }
  const a = guard.run('same', task); const b = guard.run('same', task)
  assert.equal(a, b); await tick(); assert.equal(calls, 1)
  wait.reject(new Error('failed')); await assert.rejects(a); await tick()
  assert.equal(await guard.run('same', async () => 42), 42)
})

function operationsHarness({ storage = new MemoryStorage(), find = async () => null, submit = async (op) => ({ ...receipt, requestId: op.requestId }), saved = async () => {} } = {}) {
  const hook = hooks(); const writes = []; const lookups = []; let account = provider
  globalThis.window = { localStorage: storage, addEventListener() {}, removeEventListener() {} }
  const { useScheduleOperations } = loadTs('src/hooks/useScheduleOperations.ts', { react: hook.react, '../lib/schedulingData': {
    findScheduleReceipt: async (...args) => { lookups.push(args); return find(...args) },
    submitSchedule: async (...args) => { writes.push(args[0]); return submit(...args) },
  } })
  hook.render(() => useScheduleOperations(account, saved))
  return { ...hook, storage, writes, lookups, account(value) { account = value; return hook.flush() } }
}
test('confirmation persists recovery before transport and rapid clicks send one batch', async () => {
  const wait = deferred(); const storage = new MemoryStorage()
  const h = operationsHarness({ storage, submit: () => { assert.equal(storage.length, 1); return wait.promise } })
  const a = h.flush().confirm(profile, entries); const b = h.flush().confirm(profile, entries)
  await tick(); assert.equal(h.writes.length, 1)
  wait.resolve(receipt); assert.equal(await a, true); assert.equal(await b, true); assert.equal(storage.length, 0)
  h.unmount()
})
test('unavailable browser storage prevents any database write', async () => {
  const storage = new MemoryStorage(); storage.setItem = () => { throw new Error('quota') }
  const h = operationsHarness({ storage })
  await assert.rejects(h.flush().confirm(profile, entries), /No schedule was submitted/)
  assert.equal(h.writes.length, 0); h.unmount()
})
test('lost save response retains exact key and payload; receipt recovery never writes again', async () => {
  let lookup = null; const h = operationsHarness({ submit: async () => { throw new Error('network') }, find: async () => lookup })
  assert.equal(await h.flush().confirm(profile, entries), false)
  const [pending] = h.flush().pending
  assert.deepEqual(pending, h.writes[0]); assert.equal(h.storage.length, 1)
  await assert.rejects(h.flush().confirm(profile, entries), /Resolve the previous/)
  lookup = { ...receipt, requestId: pending.requestId }
  assert.equal(await h.flush().recover(pending), true); assert.equal(h.writes.length, 1); assert.equal(h.storage.length, 0)
  h.unmount()
})
test('refresh/sign-in recovery only looks up a receipt; explicit retry uses the original request', async () => {
  const storage = new MemoryStorage(); new ScheduleRecovery(storage).retain(operation)
  const h = operationsHarness({ storage }); await tick()
  assert.equal(h.writes.length, 0); assert.equal(h.lookups.length, 1); assert.equal(storage.length, 1)
  assert.equal(await h.flush().recover(operation, true), true)
  assert.deepEqual(h.writes, [operation]); assert.equal(storage.length, 0); h.unmount()
})
test('failed receipt lookup on explicit retry preserves uncertainty even for permission errors', async () => {
  const storage = new MemoryStorage(); new ScheduleRecovery(storage).retain(operation)
  const h = operationsHarness({ storage, find: async () => { throw { code: '42501' } } }); await tick()
  assert.equal(await h.flush().recover(operation, true), false)
  assert.equal(storage.length, 1); assert.equal(h.writes.length, 0); h.unmount()
})
test('definitive batch rollback permits a corrected request but not an automatic retry', async () => {
  const h = operationsHarness({ submit: async () => { throw { code: '23505' } } })
  await assert.rejects(h.flush().confirm(profile, entries), /already have an active assignment/)
  assert.equal(h.writes.length, 1); assert.equal(h.storage.length, 0); h.unmount()
})
test('provider change during receipt lookup prevents a retry under the new account', async () => {
  const wait = deferred(); const h = operationsHarness({ find: () => wait.promise })
  const promise = h.flush().recover(operation, true); await tick(); h.account(other); wait.resolve(null)
  assert.equal(await promise, false); assert.equal(h.writes.length, 0); h.unmount()
})
test('unmount during a write retains the original account recovery record', async () => {
  const wait = deferred(); const h = operationsHarness({ submit: () => wait.promise })
  const promise = h.flush().confirm(profile, entries); await tick(); h.unmount(); wait.resolve(receipt)
  assert.equal(await promise, false); assert.equal(h.storage.length, 1)
})

function calendarHarness(load) {
  const hook = hooks(); let account = provider; let rangeLoads = []
  const events = new Map()
  globalThis.window = { addEventListener(name, listener) { events.set(name, listener) }, removeEventListener(name) { events.delete(name) }, setInterval() {}, clearInterval() {} }
  const { useAssignmentCalendar } = loadTs('src/hooks/useAssignmentCalendar.ts', { react: hook.react,
    '../lib/supabaseData': { loadRoutineAssignments: (...args) => { rangeLoads.push(args); return load(...args) } },
    '../lib/schedulingData': { loadSchedulingPolicy: async () => policy, loadScheduleOccupancy: async () => [] },
  })
  hook.render(() => useAssignmentCalendar(account, [profile]))
  return { ...hook, rangeLoads, emit(name, event) { events.get(name)?.(event) }, account(value) { account = value; return hook.flush() } }
}
test('week navigation publishes only the most recent range, including historical weeks', async () => {
  const old = deferred(); const next = deferred()
  const h = calendarHarness((_, start) => start === '2026-10-19' ? old.promise : next.promise)
  await tick(); h.flush().setWeek('2020-01-06'); h.flush(); await tick()
  next.resolve([{ patientProfileId: profile, scheduledDate: '2020-01-06', id: 'new' }]); await tick()
  assert.equal(h.flush().assignments[profile]['2020-01-06'][0].id, 'new')
  old.resolve([{ patientProfileId: profile, scheduledDate: '2026-10-19', id: 'old' }]); await tick()
  assert.equal(h.flush().assignments[profile]['2026-10-19'], undefined)
  assert.ok(h.rangeLoads.some((args) => args[1] === '2020-01-06' && args[2] === '2020-01-12')); h.unmount()
})
test('mutation invalidation discards in-flight reads and failed reloads expose no stale assignments', async () => {
  const wait = deferred(); let fail = false
  const h = calendarHarness(() => fail ? Promise.reject(new Error('reload failed')) : wait.promise)
  await tick(); h.flush(); await tick(); h.flush().invalidate()
  wait.resolve([{ patientProfileId: profile, scheduledDate: '2026-10-20', id: 'old' }]); await tick()
  assert.deepEqual(h.flush().assignments, {})
  fail = true; await assert.rejects(h.flush().refresh()); assert.match(h.flush().error, /reload failed/)
  await h.flush().refreshPolicy(); assert.match(h.flush().error, /reload failed/); h.unmount()
})
test('provider changes discard responses from the previous provider', async () => {
  const wait = deferred(); const h = calendarHarness(() => wait.promise)
  await tick(); h.flush(); await tick(); h.account(undefined)
  wait.resolve([{ patientProfileId: profile, scheduledDate: '2026-10-20', id: 'old' }]); await tick()
  assert.deepEqual(h.flush().assignments, {}); h.unmount()
})
test('scheduling RPC transport uses batch tokens, exact range names, and validates receipts', async () => {
  const calls = []; let result = { data: receipt }
  const api = loadTs('src/lib/schedulingData.ts', { './supabase': { supabase: { rpc: async (...args) => { calls.push(args); return result } } } })
  assert.deepEqual(await api.submitSchedule(operation), receipt)
  assert.deepEqual(calls[0], ['assign_routine_schedule', { p_patient_profile_id: profile, p_request_id: request, p_entries: entries }])
  await api.loadScheduleOccupancy(profile, '2020-01-01', '2020-01-07')
  assert.deepEqual(calls[1][1], { p_patient_profile_id: profile, p_start_date: '2020-01-01', p_end_date: '2020-01-07' })
  result = { data: null }; await assert.rejects(api.submitSchedule(operation), /could not be verified/)
  result = { error: { code: '42501' } }; await assert.rejects(api.submitSchedule(operation), (error) => error.code === '42501')
})
test('verified write followed by a failed refresh remains successful and never repeats the write', async () => {
  const h = operationsHarness({ saved: async () => { throw new Error('read failed') } })
  assert.equal(await h.flush().confirm(profile, entries), true)
  assert.match(h.flush().notice, /Schedule saved, but the calendar/)
  assert.equal(h.writes.length, 1); assert.equal(h.storage.length, 0); h.unmount()
})
test('malformed receipt cannot clear an unresolved confirmed operation', async () => {
  const storage = new MemoryStorage(); new ScheduleRecovery(storage).retain(operation)
  const h = operationsHarness({ storage, find: async () => ({ ...receipt, assignments: [] }) })
  await tick(); assert.equal(storage.length, 1); assert.equal(h.writes.length, 0)
  assert.equal(await h.flush().recover(operation), false); assert.equal(storage.length, 1); h.unmount()
})
test('rapid loading retries share one read; a mutation starts a fresh read', async () => {
  const wait = deferred(); const h = calendarHarness(() => wait.promise)
  await tick(); h.flush(); await tick()
  const before = h.rangeLoads.length
  const a = h.flush().refresh(); const b = h.flush().refresh()
  assert.equal(h.rangeLoads.length, before)
  h.flush().invalidate(); const c = h.flush().refresh()
  assert.equal(h.rangeLoads.length, before + 1)
  wait.resolve([]); await Promise.all([a, b, c]); h.unmount()
})
test('another tab mutation invalidates an already pending calendar read', async () => {
  const old = deferred(); let calls = 0
  const h = calendarHarness(() => ++calls === 1 ? old.promise : Promise.resolve([]))
  await tick(); h.flush(); await tick()
  h.emit('storage', { key: 'milestone.schedule.changed' }); await tick()
  assert.equal(calls, 2)
  old.resolve([{ patientProfileId: profile, scheduledDate: '2026-10-20', id: 'stale' }]); await tick()
  assert.deepEqual(h.flush().assignments, {}); h.unmount()
})
test('calendar labels retain exact dates even in zones that skipped a historical day', () => {
  const { formatCalendarDate } = loadTs('src/lib/week.ts')
  process.env.TZ = 'Pacific/Apia'
  assert.equal(formatCalendarDate('2011-12-30', { year: 'numeric', month: '2-digit', day: '2-digit' }), '12/30/2011')
})
test('snapshot loading preserves captured catalog UUIDs and never reconstructs historical unknown identity', async () => {
  const calls = []
  const responses = {
    routine_assignments: [{ id: 'assignment', patient_profile_id: profile, routine_id: routine, scheduled_date: '2026-10-20', status: 'scheduled', routine_name_snapshot: 'Original' }],
    routine_assignment_exercises: [
      { id: 'first', routine_assignment_id: 'assignment', exercise_name_snapshot: 'Captured name', exercise_id_snapshot: routine, position: 0,
        sets_snapshot: 3, reps_snapshot: 7, timer_seconds_snapshot: 45, notes_snapshot: 'Captured notes' },
      { id: 'second', routine_assignment_id: 'assignment', exercise_name_snapshot: 'Historical', exercise_id_snapshot: null, position: 1 },
    ], routine_follow_ups: [],
  }
  const supabase = { from(table) { calls.push(table); const chain = {}; for (const key of ['select','in','gte','lte','neq','order']) chain[key] = () => chain
    chain.then = (resolve) => Promise.resolve({ data: responses[table] }).then(resolve); return chain } }
  const { loadRoutineAssignments } = loadTs('src/lib/supabaseData.ts', { './supabase': { supabase } })
  const [assignment] = await loadRoutineAssignments([profile], '2026-10-19','2026-10-25')
  assert.deepEqual(assignment.exercises.map((exercise) => exercise.exerciseId), [routine, null])
  assert.equal(assignment.exercises[0].reps, 7)
  assert.equal(assignment.exercises[0].sets, 3)
  assert.equal(assignment.exercises[0].durationSeconds, 45)
  assert.equal(assignment.exercises[0].notes, 'Captured notes')
  assert.ok(!calls.includes('routines') && !calls.includes('exercises'))
})

const detailsMui = Object.fromEntries(['Alert', 'Box', 'Button', 'Stack', 'Typography'].map(name => [name, name]))
const { AssignedRoutineDetails } = loadTs('src/components/AssignedRoutineDetails.tsx', { '@mui/material': detailsMui })
function detailNodes(node) {
  if (Array.isArray(node)) return node.flatMap(detailNodes)
  return node == null || typeof node === 'boolean' ? [] : [node, ...detailNodes(node.props?.children)]
}
const detailText = (node) => detailNodes(node).filter(n => typeof n === 'string' || typeof n === 'number').join(' ')
const detailAssignment = { id: 'assigned', routineName: 'Captured routine', scheduledDate: '2026-10-21', exercises: [
  { id: 'b', position: 1, name: 'Second exercise' },
  { id: 'a', position: 0, name: 'First exercise', sets: 2, reps: 8, durationSeconds: 30, notes: 'Line one\nLine two' },
] }
const detailProps = { id: 'details', assignment: detailAssignment, loading: false, error: '', onRetry() {}, onClose() {} }

test('assignment detail rendering preserves captured values, orders positions without mutation, and labels missing fields', () => {
  const before = structuredClone(detailAssignment)
  const nodes = detailNodes(AssignedRoutineDetails(detailProps))
  assert.deepEqual(nodes.filter(n => n.props?.component === 'h4').map(detailText), ['First exercise', 'Second exercise'])
  assert.deepEqual(nodes.filter(n => n.props?.component === 'dd').map(detailText), ['2', '8', '30 seconds', 'Line one\nLine two', ...Array(4).fill('Not specified')])
  assert.equal(nodes.find(n => n.props?.component === 'time').props.dateTime, '2026-10-21')
  assert.deepEqual(detailAssignment, before)
})

test('assignment detail loading and errors suppress prescription data; retry and collapse invoke only their handlers', () => {
  let retries = 0; let closes = 0
  const loading = AssignedRoutineDetails({ ...detailProps, loading: true })
  assert.match(detailText(loading), /Loading assigned routine details/)
  assert.doesNotMatch(detailText(loading), /Captured routine|First exercise/)
  const failed = AssignedRoutineDetails({ ...detailProps, loading: true, error: 'Access denied', onRetry: () => retries++, onClose: () => closes++ })
  assert.match(detailText(failed), /Unable to load assigned routine details\.\s+Access denied/)
  assert.doesNotMatch(detailText(failed), /Captured routine|First exercise|Loading assigned/)
  detailNodes(failed).find(n => n.props?.action).props.action.props.onClick()
  detailNodes(failed).find(n => n.type === 'Button' && detailText(n) === 'Collapse details').props.onClick()
  assert.equal(retries, 1); assert.equal(closes, 1)
})

test('assignment details distinguish no captured exercises from an unavailable assignment', () => {
  const empty = AssignedRoutineDetails({ ...detailProps, assignment: { ...detailAssignment, exercises: [] } })
  assert.match(detailText(empty), /No exercise details were recorded for this assignment/)
  assert.match(detailText(empty), /Captured routine/)
  const unavailable = AssignedRoutineDetails({ ...detailProps, assignment: undefined })
  assert.match(detailText(unavailable), /This assignment is no longer available in this week/)
  assert.doesNotMatch(detailText(unavailable), /Captured routine/)
})
test('late authentication/provider responses cannot restore a previous account or signed-out session', async (t) => {
  const previousWindow = globalThis.window
  globalThis.window = { localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage(), addEventListener() {}, removeEventListener() {} }
  t.after(() => { globalThis.window = previousWindow })
  const hook = hooks(); let listener; let session = { user: { id: provider }, access_token: 'access-a', refresh_token: 'refresh-a', expires_at: 4102444800 }; const first = deferred()
  const supabase = { auth: {
    getSession: async () => ({ data: { session } }),
    onAuthStateChange: (callback) => { listener = callback; return { data: { listener: {}, subscription: { unsubscribe() {} } } } },
  } }
  const { AuthProvider } = loadTs('src/auth/AuthContext.tsx', {
    react: { ...hook.react, createContext: () => ({ Provider: 'Provider' }), useContext() {} },
    'react-router-dom': { useNavigate: () => () => {} }, '../lib/supabase': { supabase, isSupabaseConfigured: true },
    '../lib/supabaseData': { loadProvider: (id) => id === provider ? first.promise : Promise.resolve({ id }) },
    './mfa': { AuthenticationCheckError: Error, needsMfaChallenge: async () => false, getVerifiedTotpFactorId: async () => null },
  })
  hook.render(() => AuthProvider({ children: null })); await tick()
  session = { user: { id: other }, access_token: 'access-b', refresh_token: 'refresh-b', expires_at: 4102444800 }; listener('SIGNED_IN', session); await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(hook.flush().props.value.user.id, other)
  first.resolve({ id: provider }); await tick()
  assert.equal(hook.flush().props.value.user.id, other)
  listener('SIGNED_OUT', null); await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(hook.flush().props.value.user, null); hook.unmount()
})
