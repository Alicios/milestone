import test from 'node:test';
import assert from 'node:assert/strict';
import { homeActivity, homeDateRange, loadHomeActivity } from '../src/lib/home';
import type { Assignment, Patient } from '../src/types';

const patient: Patient = { id: 'patient', profileId: 'profile', name: 'Frank Murgolo', email: null, phone: null, primaryConcern: null, treatmentFocus: null, startOfCare: null, careStatus: null, dischargedAt: null };
const completed: Assignment = { id: 'completed', patientProfileId: 'profile', routineName: 'Feet Fun', scheduledDate: '2026-11-10', status: 'completed', patientResult: { inProgress: false, comment: null, source: 'demo' }, exercises: [{ id: 'balance', name: 'Feet-Together Balance', position: 0, sets: 2, reps: 1, durationSeconds: 10, notes: null, patientFeedback: { painScore: 6, feeling: 'difficult', explanation: 'I needed support.', reportedAt: '2026-11-10T20:00:00Z' } }] };

test('completed routines still surface the exact exercise issue and retain demo provenance', () => {
  const result = homeActivity([patient], [completed]);
  assert.equal(result.completed.length, 1);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].exercise?.name, 'Feet-Together Balance');
  assert.equal(result.issues[0].assignment.patientResult?.source, 'demo');
});
test('critical reports come first; high pain is flagged even with good feeling', () => {
  const critical: Assignment = { ...completed, id: 'critical', exercises: [], patientResult: { inProgress: false, issue: 'critical', comment: 'Please review.', source: 'patient' } };
  const pain: Assignment = { ...completed, id: 'pain', exercises: [{ ...completed.exercises[0], patientFeedback: { ...completed.exercises[0].patientFeedback!, painScore: 8, feeling: 'good', explanation: null } }] };
  const result = homeActivity([patient], [completed, critical, pain]);
  assert.equal(result.issues.length, 3);
  assert.equal(result.issues[0].assignment.id, 'critical');
});
test('cancelled, archived, and unrelated records cannot appear in Home', () => {
  assert.equal(homeActivity([patient], [{ ...completed, status: 'cancelled' }]).issues.length, 0);
  assert.equal(homeActivity([{ ...patient, dischargedAt: '2026-11-01' }], [completed]).completed.length, 0);
  assert.equal(homeActivity([patient], [{ ...completed, patientProfileId: 'foreign' }]).completed.length, 0);
});
test('unavailable feedback is exposed rather than an all-clear result', () => {
  assert.equal(homeActivity([patient], [{ ...completed, exercises: [], exerciseFeedbackError: 'offline' }]).feedbackUnavailable, true);
});
test('Home loads only active provider relationships and seven days, with bounded batches', async () => {
  const batches: string[][] = [];
  const result = await loadHomeActivity({ patients: async provider => { assert.equal(provider, 'provider'); return [...Array.from({ length: 51 }, (_, i) => ({ ...patient, profileId: `profile-${i}` })), { ...patient, profileId: 'archived', dischargedAt: '2026-11-01' }]; }, assignments: async (ids, from, to) => { assert.ok(Array.isArray(ids)); batches.push(ids as string[]); assert.equal(from, '2026-11-05'); assert.equal(to, '2026-11-11'); return []; } }, 'provider', '2026-11-11');
  assert.deepEqual(batches.map(batch => batch.length), [50, 1]);
  assert.equal(result.patients, 51);
  assert.deepEqual(homeDateRange('2026-01-02'), { from: '2025-12-27', to: '2026-01-02' });
});
