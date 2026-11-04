import { supabase } from './supabase';
import { normalizeAssignedExercises } from './assignedExercises';
import { loadExerciseFeedback } from './exerciseFeedback';

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data || [];
}

async function allAssignments() {
  const relationships = await rpc('get_my_care_relationships');
  const lists = await Promise.all(relationships.map(row => rpc('get_my_routine_assignments', { p_patient_profile_id: row.patient_profile_id })));
  return lists.flat();
}

// Shared by today's routine and the on-demand expand of an upcoming one.
export async function exercisesForAssignment(assignmentId, accents) {
  const rows = await rpc('get_my_routine_assignment_prescriptions', { p_routine_assignment_id: assignmentId });
  let feedback = new Map();
  let feedbackError = '';
  try { feedback = await loadExerciseFeedback(assignmentId); }
  catch { feedbackError = 'Your saved exercise responses could not be loaded. Please retry.'; }
  const list = rows.map(row => ({ assignmentExerciseId: row.id, name: row.exercise_name_snapshot, sets: row.sets_snapshot, reps: row.reps_snapshot, duration_seconds: row.timer_seconds_snapshot, notes: row.notes_snapshot }));
  return normalizeAssignedExercises(list, [], accents).map(exercise => ({
    ...exercise,
    patientFeedback: feedback.get(exercise.assignmentExerciseId),
    patientFeedbackError: feedbackError,
  }));
}

// Patient accounts read assignment snapshots, without access to provider notes
// or other patients' records. The first scheduled routine is shown for today;
// everything scheduled after today (across every provider relationship) comes
// back as a lightweight, soonest-first preview for the Routines page — its
// exercises are loaded lazily via exercisesForAssignment when expanded.
export async function loadPatientRoutine(today, accents) {
  const assignments = await allAssignments();
  const todays = assignments.filter(row => row.scheduled_date === today && row.status === 'scheduled')
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0];
  const upcoming = assignments
    .filter(row => row.scheduled_date > today && row.status !== 'cancelled')
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map(row => ({ id: row.id, name: row.routine_name_snapshot, scheduledDate: row.scheduled_date, status: row.status }));
  if (!todays) return { routine: null, exercises: [], upcoming };
  const exercises = await exercisesForAssignment(todays.id, accents);
  return {
    routine: { name: todays.routine_name_snapshot, assignmentId: todays.id, scheduledDate: todays.scheduled_date, status: todays.status },
    exercises,
    upcoming,
  };
}
