import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/modules.mjs'
const { resolveRoutineStatus: resolve } = loadTs('src/lib/routineStatus.ts')
const row = (status = 'scheduled', scheduledDate = '2026-11-03') => ({ status, scheduledDate })

test('scheduled day remains neutral; prior days are missed, including modified and partial routines', () => {
  assert.equal(resolve(row(), '2026-11-03').status, 'neutral')
  assert.equal(resolve(row(), '2026-11-02').status, 'neutral')
  assert.equal(resolve(row(), '2026-11-04').status, 'missed')
  assert.equal(resolve(row('modified'), '2026-11-04').status, 'missed')
  assert.equal(resolve(row(), '2026-11-04', { inProgress: true }).status, 'missed')
  assert.equal(resolve(row('scheduled', '2026-11-01'), '2026-11-02').status, 'missed')
})
test('no policy means no inferred missed status; explicit missed remains missed', () => {
  assert.equal(resolve(row('scheduled', '2000-01-01')).status, 'neutral')
  assert.equal(resolve(row('modified')).label, 'Modified')
  assert.equal(resolve(row('missed')).status, 'missed')
})
test('completion and issues obey precedence without losing overdue issue information', () => {
  assert.equal(resolve(row('completed'), '2026-11-04').status, 'completed')
  assert.equal(resolve(row('completed'), '2026-11-04', { issue: 'noncritical' }).status, 'issue')
  assert.equal(resolve(row('missed'), '2026-11-04', { issue: 'critical' }).status, 'critical')
  assert.equal(resolve(row('completed'), undefined, { issue: 'critical' }).status, 'critical')
  assert.deepEqual(resolve(row(), '2026-11-04', { issue: 'noncritical' }), { status: 'missed', label: 'Missed routine · Patient reported an issue' })
  assert.equal(resolve(row(), '2026-11-03', { inProgress: true }).status, 'inProgress')
  assert.equal(resolve(row('completed'), undefined, { inProgress: true }).status, 'completed')
  assert.equal(resolve(row('cancelled'), '2026-11-04', { issue: 'critical' }), null)
})

test('stored patient feedback drives colors and preview signals can override it', () => {
  const assignment = { ...row('completed'), patientResult: { inProgress: false, issue: 'noncritical', comment: 'Balance was difficult.', source: 'demo' } }
  assert.equal(resolve(assignment, '2026-11-04').status, 'issue')
  assert.equal(resolve(assignment, '2026-11-04', { issue: 'critical' }).status, 'critical')
  assert.equal(resolve({ ...row(), patientResult: { inProgress: true } }, '2026-11-03').status, 'inProgress')
})

test('patient result fields load with the assignment and old schema alone permits a fallback', async () => {
  const columns = []
  let scenario = 'current'
  const assignment = { id: 'a', patient_profile_id: 'p', routine_id: 'r', scheduled_date: '2026-10-27', status: 'completed', routine_name_snapshot: 'Balance',
    patient_in_progress: false, patient_issue_severity: 'noncritical', patient_comment: 'I needed a break.\nPlease review.', patient_result_source: 'demo' }
  const failure = { code: '42501', message: 'Feedback access denied' }
  const supabase = { from(table) {
    const chain = {}
    let selected
    for (const method of ['select', 'in', 'gte', 'lte', 'neq', 'order']) chain[method] = (...args) => {
      if (method === 'select') { selected = args[0]; if (table === 'routine_assignments') columns.push(selected) }
      return chain
    }
    chain.then = (accept, reject) => {
      if (table !== 'routine_assignments') return Promise.resolve({ data: [] }).then(accept, reject)
      if (scenario === 'denied') return Promise.resolve({ error: failure }).then(accept, reject)
      if (scenario === 'legacy' && selected.includes('patient_comment')) return Promise.resolve({ error: { code: '42703', message: 'column patient_comment does not exist' } }).then(accept, reject)
      const { patient_in_progress, patient_issue_severity, patient_comment, patient_result_source, ...legacy } = assignment
      return Promise.resolve({ data: [scenario === 'legacy' ? legacy : assignment] }).then(accept, reject)
    }
    return chain
  } }
  const { loadRoutineAssignments } = loadTs('src/lib/supabaseData.ts', { './supabase': { supabase } })
  const [current] = await loadRoutineAssignments(['p'], '2026-10-26', '2026-11-01')
  assert.deepEqual(current.patientResult, { inProgress: false, issue: 'noncritical', comment: assignment.patient_comment, source: 'demo' })
  assert.equal(resolve(current, '2026-11-03').status, 'issue')
  scenario = 'legacy'; columns.length = 0
  const [legacy] = await loadRoutineAssignments(['p'], '2026-10-26', '2026-11-01')
  assert.equal(legacy.patientResult, undefined)
  assert.equal(columns.length, 2)
  scenario = 'denied'; columns.length = 0
  await assert.rejects(loadRoutineAssignments(['p'], '2026-10-26', '2026-11-01'), (error) => error.code === 'FORBIDDEN')
  assert.equal(columns.length, 1)
})
