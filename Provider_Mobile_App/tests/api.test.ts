import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { allRows, createProviderApi } from '../src/lib/api';

type Call = { table: string; method: string; args: unknown[] };
function fake(responses: Record<string, { data?: unknown; error?: unknown }>) {
  const calls: Call[] = [];
  const query = (table: string): any => {
    const builder: any = {};
    for (const method of ['select', 'eq', 'gte', 'lte', 'neq', 'order', 'range', 'single', 'in', 'insert', 'update']) builder[method] = (...args: unknown[]) => { calls.push({ table, method, args }); return builder; };
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: responses[table]?.data ?? [], error: responses[table]?.error ?? null }).then(resolve);
    return builder;
  };
  return { calls, api: createProviderApi({ from: query, rpc: query } as unknown as SupabaseClient) };
}
test('lists beyond the hosted row limit are fully paginated; errors never become empty success', async () => {
  const rows = Array.from({ length: 1001 }, (_, id) => ({ id }));
  const result = await allRows<{ id: number }>(async (start, end) => ({ data: rows.slice(start, end + 1), error: null }));
  assert.equal(result.length, 1001);
  await assert.rejects(allRows(async () => ({ data: null, error: new Error('permission denied') })), /permission/);
});
test('patients are scoped to relationship IDs and onboarding codes are never queried', async () => {
  const { api, calls } = fake({ provider_patient_profiles: { data: [{ id: 'relationship-a', patient_id: 'patient-a', discharged_at: null }] }, patients: { data: [{ id: 'patient-a', name: 'Case A' }] } });
  const result = await api.patients('provider-a');
  assert.equal(result[0].profileId, 'relationship-a');
  assert.ok(calls.some(call => call.table === 'provider_patient_profiles' && call.method === 'eq' && call.args[0] === 'provider_id' && call.args[1] === 'provider-a'));
  assert.ok(!JSON.stringify(calls).includes('otp'));
});
test('feedback failures retain prescriptions and explicitly report unavailable feedback', async () => {
  const { api, calls } = fake({ routine_assignments: { data: [{ id: 'assignment-a', patient_profile_id: 'relationship-a', status: 'scheduled', scheduled_date: '2026-11-09', routine_name_snapshot: 'Gentle routine' }] },
    routine_assignment_exercises: { data: [{ id: 'exercise-a', routine_assignment_id: 'assignment-a', exercise_name_snapshot: 'Stretch', position: 0, sets_snapshot: 3, reps_snapshot: 10, timer_seconds_snapshot: null, notes_snapshot: 'Go slowly' }] },
    routine_assignment_exercise_feedback: { error: new Error('offline') } });
  const rows = await api.assignments('relationship-a', '2026-11-09', '2026-11-15');
  assert.equal(rows[0].exercises[0].sets, 3);
  assert.match(rows[0].exerciseFeedbackError!, /could not be loaded/);
  assert.ok(calls.some(call => call.table === 'routine_assignments' && call.method === 'eq' && call.args[1] === 'relationship-a'));
});
test('sending validates before network access; read/star changes include participant and relationship', async () => {
  const { api, calls } = fake({});
  await assert.rejects(api.send('relationship-a', ' '));
  assert.equal(calls.length, 0);
  await api.send('relationship-a', '  Hello  ');
  assert.deepEqual(calls.find(call => call.method === 'insert')?.args[0], { patient_profile_id: 'relationship-a', sender_kind: 'provider', body: 'Hello' });
  await api.markRead('relationship-a', 'provider-a', '2026-11-09T10:00:00Z');
  await api.star('relationship-a', 'provider-a', true);
  assert.equal(calls.filter(call => call.method === 'eq' && call.args[0] === 'participant_user_id' && call.args[1] === 'provider-a').length, 2);
});


test('list filters read only lightweight routine statuses, batched and relationship scoped', async () => {
  const { api, calls } = fake({ routine_assignments: { data: [] } });
  await api.assignmentStatuses(Array.from({ length: 101 }, (_, i) => `relationship-${i}`), '2026-11-09', '2026-11-15');
  const groups = calls.filter(call => call.method === 'in');
  assert.equal(groups.length, 2);
  assert.equal((groups[0].args[1] as string[]).length, 100);
  assert.equal((groups[1].args[1] as string[]).length, 1);
  assert.ok(calls.every(call => call.table === 'routine_assignments'));
  assert.ok(calls.filter(call => call.method === 'select').every(call => !(call.args[0] as string).includes('snapshot')));
});
test('unavailable list statuses reject instead of becoming an unassigned result', async () => {
  const { api } = fake({ routine_assignments: { error: new Error('offline') } });
  await assert.rejects(api.assignmentStatuses(['relationship-a'], '2026-11-09', '2026-11-15'), /offline/);
});
