import type { SupabaseClient } from '@supabase/supabase-js';
import type { Assignment, Conversation, Message, Patient, Provider } from '../types';
import { validateMessage } from './domain';
import { archiveCursor, isConversationArchived } from './conversationArchive';
import type { AssignmentSummary } from './patientFilters';

// Paginate every list; the hosted API's row limit must not truncate a caseload.
export async function allRows<T>(query: (start: number, end: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const result: T[] = [];
  for (let start = 0; ; start += 500) {
    const response = await query(start, start + 499);
    if (response.error) throw response.error;
    const page = (response.data ?? []) as T[];
    result.push(...page);
    if (page.length < 500) return result;
  }
}
export function createProviderApi(client: SupabaseClient) {
  return {
    async provider(userId: string, authEmail: string): Promise<Provider> {
      const { data, error } = await client.from('providers')
        .select('id,name,professional_title,contact_email,avatar_url,phone,medical_practices(name)').eq('id', userId).single();
      if (error || !data) throw new Error('This account does not have an accessible provider profile.');
      const practice = data.medical_practices as unknown as { name: string } | null;
      return { id: data.id, name: data.name, professionalTitle: data.professional_title, email: data.contact_email || authEmail, avatarUrl: data.avatar_url, phone: data.phone, practice: practice?.name ?? null };
    },
    async patients(providerId: string): Promise<Patient[]> {
      type Relationship = { id: string; patient_id: string; discharged_at: string | null };
      const relationships = await allRows<Relationship>((start, end) => client.from('provider_patient_profiles')
        .select('id,patient_id,discharged_at').eq('provider_id', providerId).order('id').range(start, end));
      if (!relationships.length) return [];
      type Row = { id: string; name: string; email: string | null; phone: string | null; primary_concern: string | null; treatment_focus: string | null; start_of_care: string | null; care_status: string | null };
      const patients: Row[] = [];
      for (let i = 0; i < relationships.length; i += 100) {
        const ids = relationships.slice(i, i + 100).map(row => row.patient_id);
        patients.push(...await allRows<Row>((start, end) => client.from('patients')
          .select('id,name,email,phone,primary_concern,treatment_focus,start_of_care,care_status').in('id', ids).order('id').range(start, end)));
      }
      const byId = new Map(patients.map(row => [row.id, row]));
      return relationships.flatMap(relationship => {
        const row = byId.get(relationship.patient_id);
        return row ? [{ id: row.id, profileId: relationship.id, name: row.name, email: row.email, phone: row.phone,
          primaryConcern: row.primary_concern, treatmentFocus: row.treatment_focus, startOfCare: row.start_of_care,
          careStatus: row.care_status, dischargedAt: relationship.discharged_at }] : [];
      }).sort((a, b) => a.name.localeCompare(b.name));
    },
    async assignmentStatuses(profileIds: string[], from: string, to: string): Promise<AssignmentSummary[]> {
      type Row = { id: string; patient_profile_id: string; scheduled_date: string; status: Assignment['status']; patient_in_progress: boolean; patient_issue_severity: string; patient_comment: string | null; patient_result_source: 'patient' | 'demo' | null };
      const rows: Row[] = [];
      for (let offset = 0; offset < profileIds.length; offset += 100) {
        rows.push(...await allRows<Row>((start, end) => client.from('routine_assignments')
          .select('id,patient_profile_id,scheduled_date,status,patient_in_progress,patient_issue_severity,patient_comment,patient_result_source')
          .in('patient_profile_id', profileIds.slice(offset, offset + 100)).gte('scheduled_date', from).lte('scheduled_date', to)
          .neq('status', 'cancelled').order('id').range(start, end)));
      }
      return rows.map(row => ({ id: row.id, patientProfileId: row.patient_profile_id, scheduledDate: row.scheduled_date, status: row.status,
        patientResult: { inProgress: row.patient_in_progress, issue: row.patient_issue_severity === 'critical' || row.patient_issue_severity === 'noncritical' ? row.patient_issue_severity : undefined, comment: row.patient_comment, source: row.patient_result_source } }));
    },
    async assignments(profileId: string, from: string, to: string): Promise<Assignment[]> {
      type Row = { id: string; routine_id: string; updated_at: string; patient_profile_id: string; routine_name_snapshot: string; scheduled_date: string; status: Assignment['status']; patient_in_progress: boolean; patient_issue_severity: string; patient_comment: string | null; patient_result_source: 'patient' | 'demo' | null };
      const rows = await allRows<Row>((start, end) => client.from('routine_assignments')
        .select('id,routine_id,updated_at,patient_profile_id,routine_name_snapshot,scheduled_date,status,patient_in_progress,patient_issue_severity,patient_comment,patient_result_source')
        .eq('patient_profile_id', profileId).gte('scheduled_date', from).lte('scheduled_date', to).neq('status', 'cancelled')
        .order('scheduled_date').order('id').range(start, end));
      if (!rows.length) return [];
      type ExerciseRow = { id: string; routine_assignment_id: string; exercise_name_snapshot: string; position: number; sets_snapshot: number | null; reps_snapshot: number | null; timer_seconds_snapshot: number | null; notes_snapshot: string | null };
      const exercises = await allRows<ExerciseRow>((start, end) => client.from('routine_assignment_exercises')
        .select('id,routine_assignment_id,exercise_name_snapshot,position,sets_snapshot,reps_snapshot,timer_seconds_snapshot,notes_snapshot')
        .in('routine_assignment_id', rows.map(row => row.id)).order('position').order('id').range(start, end));
      type FeedbackRow = { routine_assignment_exercise_id: string; pain_score: number; feeling: 'good' | 'neutral' | 'difficult'; explanation: string | null; reported_at: string };
      const feedback = new Map<string, FeedbackRow>();
      let exerciseFeedbackError: string | undefined;
      try {
        for (let i = 0; i < exercises.length; i += 100) {
          const ids = exercises.slice(i, i + 100).map(row => row.id);
          const batch = await allRows<FeedbackRow>((start, end) => client.from('routine_assignment_exercise_feedback')
            .select('routine_assignment_exercise_id,pain_score,feeling,explanation,reported_at').in('routine_assignment_exercise_id', ids)
            .order('routine_assignment_exercise_id').range(start, end));
          for (const row of batch) feedback.set(row.routine_assignment_exercise_id, row);
        }
      } catch { exerciseFeedbackError = 'Patient exercise feedback could not be loaded. Pull down to retry.'; }
      return rows.map(row => ({
        id: row.id, routineId: row.routine_id, updatedAt: row.updated_at, patientProfileId: row.patient_profile_id, routineName: row.routine_name_snapshot,
        scheduledDate: row.scheduled_date, status: row.status, exerciseFeedbackError,
        patientResult: { inProgress: row.patient_in_progress, issue: row.patient_issue_severity === 'critical' || row.patient_issue_severity === 'noncritical' ? row.patient_issue_severity : undefined,
          comment: row.patient_comment, source: row.patient_result_source },
        exercises: exercises.filter(exercise => exercise.routine_assignment_id === row.id).map(exercise => {
          const report = feedback.get(exercise.id);
          return { id: exercise.id, name: exercise.exercise_name_snapshot, position: exercise.position, sets: exercise.sets_snapshot,
            reps: exercise.reps_snapshot, durationSeconds: exercise.timer_seconds_snapshot, notes: exercise.notes_snapshot,
            patientFeedback: report ? { painScore: report.pain_score, feeling: report.feeling, explanation: report.explanation, reportedAt: report.reported_at } : undefined };
        }),
      }));
    },
    async conversations(providerId: string): Promise<Conversation[]> {
      type Row = { patient_profile_id: string; patient_name: string; last_body: string | null; last_message_at: string | null; unread_count: number | string; starred: boolean };
      const rows = await allRows<Row>((start, end) => client.rpc('get_provider_message_inbox').range(start, end));
      type ArchiveRow = { patient_profile_id: string; archived_through_at: string | null };
      const archive = new Map<string, string | null>();
      for (let offset = 0; offset < rows.length; offset += 100) {
        const states = await allRows<ArchiveRow>((start, end) => client.from('message_thread_state')
          .select('patient_profile_id,archived_through_at').eq('participant_user_id', providerId)
          .in('patient_profile_id', rows.slice(offset, offset + 100).map(row => row.patient_profile_id))
          .order('patient_profile_id').range(start, end));
        for (const state of states) archive.set(state.patient_profile_id, state.archived_through_at);
      }
      return rows.map(row => {
        const archivedThroughAt = archive.get(row.patient_profile_id) ?? null;
        return { id: row.patient_profile_id, name: row.patient_name, preview: row.last_body ?? 'Start a conversation', lastMessageAt: row.last_message_at, unread: Number(row.unread_count), starred: row.starred,
          archivedThroughAt, archived: isConversationArchived(row.last_message_at, archivedThroughAt) };
      });
    },
    async messages(profileId: string): Promise<Message[]> {
      type Row = { id: string; body: string; sender_kind: 'patient' | 'provider'; created_at: string };
      const rows = await allRows<Row>((start, end) => client.from('messages').select('id,body,sender_kind,created_at')
        .eq('patient_profile_id', profileId).order('created_at').order('id').range(start, end));
      return rows.map(row => ({ id: row.id, text: row.body, from: row.sender_kind, createdAt: row.created_at }));
    },
    async send(profileId: string, text: string): Promise<void> {
      const body = validateMessage(text);
      const { error } = await client.from('messages').insert({ patient_profile_id: profileId, sender_kind: 'provider', body });
      if (error) throw error;
    },
    async archiveConversation(profileId: string, participantId: string, through: string | null): Promise<string | null> {
      if (through !== null) archiveCursor(through);
      const { data, error } = await client.from('message_thread_state').update({ archived_through_at: through })
        .eq('patient_profile_id', profileId).eq('participant_user_id', participantId)
        .select('patient_profile_id,archived_through_at').single();
      if (error) throw error;
      if (!data || data.patient_profile_id !== profileId) throw new Error('Conversation archive state could not be saved.');
      return data.archived_through_at;
    },
    async markRead(profileId: string, participantId: string, through: string) {
      const { error } = await client.from('message_thread_state').update({ last_read_at: through })
        .eq('patient_profile_id', profileId).eq('participant_user_id', participantId);
      if (error) throw error;
    },
    async star(profileId: string, participantId: string, starred: boolean) {
      const { error } = await client.from('message_thread_state').update({ starred })
        .eq('patient_profile_id', profileId).eq('participant_user_id', participantId);
      if (error) throw error;
    },
  };
}
