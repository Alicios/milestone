import type { SupabaseClient } from '@supabase/supabase-js';
import type { Assignment } from '../types';
import { allRows } from './api';

export type SchedulingPolicy = { today: string; lastDate: string; timeZone: string; horizonDays: number };
export type SavedRoutine = { id: string; name: string; description: string | null };
export type ConfirmedEntry = { date: string; routineId: string; token: string };
export type Preview = {
  policy: SchedulingPolicy;
  entries: (ConfirmedEntry & { routineName: string; exercises: { name: string; sets: number | null; reps: number | null; durationSeconds: number | null; notes: string | null }[] })[];
  conflicts: { date: string; assignmentId: string | null }[];
};
export type ScheduleOperation = {
  providerId: string; patientProfileId: string; requestId: string;
  entry: ConfirmedEntry | null;
  previous?: { id: string; updatedAt: string };
};
export type Receipt = { requestId: string; patientProfileId: string; previousAssignmentId?: string; assignments: { id: string; date: string; routineId: string }[] };
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function verifiedReceipt(value: unknown, operation: ScheduleOperation): Receipt {
  const result = value as Receipt | null;
  if (!result || result.requestId !== operation.requestId || result.patientProfileId !== operation.patientProfileId
    || result.previousAssignmentId !== operation.previous?.id || !Array.isArray(result.assignments)
    || result.assignments.length !== (operation.entry ? 1 : 0)
    || result.assignments.some(row => !row || !uuid.test(row.id) || row.date !== operation.entry?.date || row.routineId !== operation.entry?.routineId)) {
    throw new Error('The save response could not be verified. Check the saved request before trying again.');
  }
  return result;
}
export function parsePending(raw: string, providerId: string, profileId: string): ScheduleOperation {
  const value = JSON.parse(raw) as ScheduleOperation;
  if (!value || value.providerId !== providerId || value.patientProfileId !== profileId || !uuid.test(value.requestId)
    || (!value.entry && !value.previous)
    || (value.entry && (!uuid.test(value.entry.routineId) || !/^\d{4}-\d{2}-\d{2}$/.test(value.entry.date) || typeof value.entry.token !== 'string' || !value.entry.token))
    || (value.previous && (!uuid.test(value.previous.id) || !value.previous.updatedAt || !Number.isFinite(Date.parse(value.previous.updatedAt))))) {
    throw new Error('The saved request is unreadable. No new schedule was submitted.');
  }
  return value;
}
export function definitiveFailure(error: unknown) {
  return ['22023','22007','22P02','23505','23514','42501','P0002','40001','55000','PGRST202'].includes((error as { code?: string })?.code ?? '');
}
export function schedulingError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === '40001') return 'The routine or assignment changed. Refresh and review it again.';
  if (code === '23505') return 'This date already has an assignment. Refresh to see the current schedule.';
  if (code === '55000') return 'This routine has started. Its recorded care history is preserved.';
  if (code === '42501') return 'This active patient relationship or saved routine is no longer available.';
  if (code === '22023') return 'The selected date or routine is no longer available. Refresh and choose again.';
  if (code === 'PGRST202') return 'Routine scheduling is temporarily unavailable. Please try again later.';
  return 'The result could not be confirmed. Check the saved request before retrying.';
}
export function withinHorizon(date: string, policy?: SchedulingPolicy) { return Boolean(policy && date >= policy.today && date <= policy.lastDate); }
export function canChange(assignment: Assignment, policy?: SchedulingPolicy) {
  return withinHorizon(assignment.scheduledDate, policy) && Boolean(assignment.updatedAt)
    && ['scheduled','modified'].includes(assignment.status) && !assignment.patientResult?.inProgress
    && !assignment.patientResult?.issue && !assignment.patientResult?.comment
    && !assignment.exerciseFeedbackError && !assignment.exercises.some(row => row.patientFeedback);
}
export function weekDatesFor(date: string, offset = 0) {
  const anchor = new Date(`${date}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() - ((anchor.getUTCDay() + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => { const day = new Date(anchor); day.setUTCDate(day.getUTCDate() + i); return day.toISOString().slice(0, 10); });
}
export function createSchedulingApi(client: SupabaseClient) {
  async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data as T;
  }
  return {
    policy: () => rpc<SchedulingPolicy>('get_routine_scheduling_policy'),
    routines: (providerId: string) => allRows<SavedRoutine>((start, end) => client.from('routines').select('id,name,description')
      .eq('provider_id', providerId).is('archived_at', null).order('name').order('id').range(start, end)),
    preview: (profileId: string, date: string, routineId: string) => rpc<Preview>('preview_routine_schedule', {
      p_patient_profile_id: profileId, p_entries: [{ date, routineId }],
    }),
    async submit(operation: ScheduleOperation) {
      const data = operation.previous
        ? await rpc('change_patient_routine', { p_assignment_id: operation.previous.id, p_request_id: operation.requestId,
          p_routine_id: operation.entry?.routineId ?? null, p_token: operation.entry?.token ?? null, p_expected_updated_at: operation.previous.updatedAt })
        : await rpc('assign_routine_schedule', { p_patient_profile_id: operation.patientProfileId, p_request_id: operation.requestId, p_entries: [operation.entry] });
      return verifiedReceipt(data, operation);
    },
    async receipt(operation: ScheduleOperation) {
      let value: unknown;
      if (operation.previous) {
        const { data, error } = await client.from('provider_assignment_change_requests').select('result')
          .eq('provider_id', operation.providerId).eq('request_id', operation.requestId).maybeSingle();
        if (error) throw error;
        value = data?.result;
      } else value = await rpc('get_routine_schedule_request', { p_request_id: operation.requestId });
      return value == null ? null : verifiedReceipt(value, operation);
    },
  };
}
