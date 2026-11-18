import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/modules.mjs'

test('provider reads join feedback by snapshot ID and feedback failures retain prescription details', async () => {
  let fail = false
  const reads = []
  const responses = {
    routine_assignments: [{ id: 'assignment', patient_profile_id: 'profile', routine_id: 'routine', scheduled_date: '2026-11-03', status: 'scheduled', routine_name_snapshot: 'Assigned', patient_in_progress: false, patient_result_source: 'demo' }],
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
  assert.equal(assignment.patientResult.issue, 'critical')
  assert.equal(assignment.patientResult.source, 'demo')
  assert.ok(reads.some((read) => read[0] === 'routine_assignment_exercise_feedback' && read[1] === 'in' && read[2] === 'routine_assignment_exercise_id' && read[3].join() === 'first,second'))
  responses.routine_assignments[0].status = 'completed'
  for (const [pain, feeling, stored, expected] of [
    [3, 'good', 'none', undefined], [4, 'good', 'none', 'noncritical'],
    [2, 'neutral', 'none', 'noncritical'], [2, 'difficult', 'none', 'noncritical'],
    [7, 'good', 'none', 'critical'], [10, 'good', 'noncritical', 'critical'],
    [1, 'good', 'critical', 'critical'],
  ]) {
    Object.assign(responses.routine_assignment_exercise_feedback[0], { pain_score: pain, feeling })
    responses.routine_assignments[0].patient_issue_severity = stored
    const [rated] = await loadRoutineAssignments(['profile'], '2026-11-02', '2026-11-08')
    assert.equal(rated.patientResult.issue, expected)
    assert.equal(rated.patientResult.source, 'demo')
    assert.equal(rated.status, 'completed')
  }
  fail = true
  const [unavailable] = await loadRoutineAssignments(['profile'], '2026-11-02', '2026-11-08')
  assert.match(unavailable.exerciseFeedbackError, /could not be loaded/)
  assert.equal(unavailable.exercises.length, 2)
  assert.equal(unavailable.exercises[1].notes, 'Provider instruction')
  assert.equal(unavailable.exercises[1].patientFeedback, undefined)
})
