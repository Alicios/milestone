import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canChange, createSchedulingApi, parsePending, verifiedReceipt, weekDatesFor, type ScheduleOperation } from '../src/lib/scheduling';
import { routinePresentation } from '../src/lib/routinePresentation';
import type { Assignment } from '../src/types';

const operation: ScheduleOperation = { providerId: 'provider', patientProfileId: 'profile', requestId: '10000000-0000-0000-0000-000000000001', entry: { date: '2026-11-11', routineId: '20000000-0000-0000-0000-000000000001', token: 'confirmed' } };
const assignment: Assignment = { id: '30000000-0000-0000-0000-000000000001', updatedAt: '2026-11-11T10:00:00.123456Z', routineName: 'Routine', scheduledDate: '2026-11-11', patientProfileId: 'profile', status: 'scheduled', exercises: [] };
const policy = { today: '2026-11-11', lastDate: '2026-11-24', horizonDays: 14, timeZone: 'America/Los_Angeles' };
test('receipt verification rejects missing, foreign, mismatched, and incomplete saves', () => {
  const receipt = { requestId: operation.requestId, patientProfileId: operation.patientProfileId, assignments: [{ id: assignment.id, date: operation.entry!.date, routineId: operation.entry!.routineId }] };
  assert.deepEqual(verifiedReceipt(receipt, operation), receipt);
  for (const wrong of [null, { ...receipt, requestId: 'wrong' }, { ...receipt, patientProfileId: 'foreign' }, { ...receipt, assignments: [] }, { ...receipt, previousAssignmentId: assignment.id }]) {
    assert.throws(() => verifiedReceipt(wrong, operation));
  }
  const removal = { ...operation, entry: null, previous: { id: assignment.id, updatedAt: assignment.updatedAt! } };
  assert.doesNotThrow(() => verifiedReceipt({ ...receipt, previousAssignmentId: assignment.id, assignments: [] }, removal));
});
test('saved recovery is provider and relationship scoped and retains exact preview/version', () => {
  assert.deepEqual(parsePending(JSON.stringify(operation), 'provider', 'profile'), operation);
  assert.throws(() => parsePending(JSON.stringify(operation), 'other-provider', 'profile'));
  assert.throws(() => parsePending(JSON.stringify(operation), 'provider', 'other-profile'));
  assert.throws(() => parsePending(JSON.stringify({ ...operation, entry: null }), 'provider', 'profile'));
});
test('changes require server policy, an unstarted assignment and readable feedback', () => {
  assert.equal(canChange(assignment, policy), true);
  for (const row of [{ ...assignment, status: 'completed' as const }, { ...assignment, status: 'cancelled' as const }, { ...assignment, scheduledDate: '2026-11-10' }, { ...assignment, updatedAt: undefined }, { ...assignment, exerciseFeedbackError: 'offline' }, { ...assignment, patientResult: { inProgress: true, comment: null, source: 'patient' as const } }]) {
    assert.equal(canChange(row, policy), false);
  }
  assert.equal(canChange(assignment), false);
  assert.deepEqual(weekDatesFor('2027-01-01').slice(0,2), ['2026-12-28', '2026-12-29']);
});
test('completed issue indicators retain severity and completion without changing missed inference', () => {
  const issue = { inProgress: false, issue: 'noncritical' as const, comment: null, source: 'patient' as const };
  assert.equal(routinePresentation({ ...assignment, status: 'completed', patientResult: issue }, policy.today)?.label, 'Completed with issues');
  assert.equal(routinePresentation({ ...assignment, status: 'completed', patientResult: { ...issue, issue: 'critical' } }, policy.today)?.status, 'critical');
  assert.equal(routinePresentation({ ...assignment, scheduledDate: '2026-01-01' })?.status, 'neutral');
});
test('replacement uses one atomic RPC with exact version and receipt checking', async () => {
  const replacement = { ...operation, previous: { id: assignment.id, updatedAt: assignment.updatedAt! } };
  const calls: unknown[] = [];
  const api = createSchedulingApi({ rpc: async (name: string, args: unknown) => {
    calls.push({ name, args });
    return { error: null, data: { requestId: operation.requestId, patientProfileId: operation.patientProfileId, previousAssignmentId: assignment.id, assignments: [{ id: '40000000-0000-0000-0000-000000000001', date: operation.entry!.date, routineId: operation.entry!.routineId }] } };
  } } as unknown as SupabaseClient);
  await api.submit(replacement);
  assert.deepEqual(calls, [{ name: 'change_patient_routine', args: { p_assignment_id: assignment.id, p_request_id: operation.requestId, p_routine_id: operation.entry!.routineId, p_token: operation.entry!.token, p_expected_updated_at: assignment.updatedAt } }]);
});
