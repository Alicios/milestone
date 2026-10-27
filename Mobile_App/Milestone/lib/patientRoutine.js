import { supabase } from './supabase';
import { normalizeAssignedExercises } from './assignedExercises';

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data || [];
}

// Patient accounts read assignment snapshots, without access to provider notes
// or other patients' records. The first scheduled routine is shown for today.
export async function loadPatientRoutine(today, accents) {
  const relationships = await rpc('get_my_care_relationships');
  const lists = await Promise.all(relationships.map(row => rpc('get_my_routine_assignments', { p_patient_profile_id: row.patient_profile_id })));
  const assignment = lists.flat().filter(row => row.scheduled_date === today && row.status === 'scheduled')
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0];
  if (!assignment) return { routine: null, exercises: [] };
  const rows = await rpc('get_my_routine_assignment_prescriptions', { p_routine_assignment_id: assignment.id });
  const list = rows.map(row => ({ name: row.exercise_name_snapshot, sets: row.sets_snapshot, reps: row.reps_snapshot, duration_seconds: row.timer_seconds_snapshot, notes: row.notes_snapshot }));
  return {
    routine: { name: assignment.routine_name_snapshot, assignmentId: assignment.id, scheduledDate: assignment.scheduled_date, status: assignment.status },
    exercises: normalizeAssignedExercises(list, [], accents),
  };
}
