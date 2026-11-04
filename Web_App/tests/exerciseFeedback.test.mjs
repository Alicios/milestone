import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/modules.mjs'

test('provider reads join feedback by snapshot ID and feedback failures retain prescription details', async () => {
  let fail = false
  const reads = []
  const responses = {
    routine_assignments: [{ id: 'assignment', patient_profile_id: 'profile', routine_id: 'routine', scheduled_date: '2026-11-03', status: 'scheduled', routine_name_snapshot: 'Assigned' }],
    routine_assignment_exercises: ['first', 'second'].map((id, position) => ({ id, routine_assignment_id: 'assignment', exercise_name_snapshot: 'Repeated name', position, notes_snapshot: 'Provider instruction' })),
    routine_follow_ups: [],
    routine_assignment_exercise_feedback: [{ routine_assignment_exercise_id: 'second', pain_score: 7, feeling: 'neutral', explanation: 'A break helped.', reported_at: '2026-11-03T18:00:00Z' }],
  }
  const supabase = { from(table) {
    const chain = {}
    for (const method of ['select', 'in', 'gte', 'lte', 'neq', 'order']) chain[method] = (...args) => { reads.push([table, method, ...args]); return chain }
    chain.then = (accept, reject) => Promise.resolve(fail && table === 'routine_assignment_exercise_feedback' ? { error: { code: '42501' } } : { data: responses[table] || [] }).then(accept, reject)
    return chain
  } }
  const { loadRoutineAssignments } = loadTs('src/lib/supabaseData.ts', { './supabase': { supabase } })
  const [assignment] = await loadRoutineAssignments(['profile'], '2026-11-02', '2026-11-08')
  assert.equal(assignment.exercises[0].patientFeedback, undefined)
  assert.equal(assignment.exercises[1].patientFeedback.painScore, 7)
  assert.equal(assignment.status, 'scheduled')
  assert.ok(reads.some((read) => read[0] === 'routine_assignment_exercise_feedback' && read[1] === 'in' && read[2] === 'routine_assignment_exercise_id' && read[3].join() === 'first,second'))
  fail = true
  const [unavailable] = await loadRoutineAssignments(['profile'], '2026-11-02', '2026-11-08')
  assert.match(unavailable.exerciseFeedbackError, /could not be loaded/)
  assert.equal(unavailable.exercises.length, 2)
  assert.equal(unavailable.exercises[1].notes, 'Provider instruction')
  assert.equal(unavailable.exercises[1].patientFeedback, undefined)
})
