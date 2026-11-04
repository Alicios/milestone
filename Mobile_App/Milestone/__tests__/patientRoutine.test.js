import { loadPatientRoutine, exercisesForAssignment } from '../lib/patientRoutine';
import { supabase } from '../lib/supabase';
jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
test('loads only today’s scheduled assignment and uses its prescription snapshots', async () => {
  supabase.rpc.mockImplementation(async name => ({ data: name === 'get_my_care_relationships' ? [{ patient_profile_id: 'relationship' }]
    : name === 'get_my_routine_assignments' ? [{ id: 'assignment', status: 'scheduled', scheduled_date: '2026-10-26', created_at: '2026-10-25', routine_name_snapshot: 'Saved routine' }]
    : name === 'get_my_routine_exercise_feedback' ? [] : [{ id: 'snapshot-one', exercise_name_snapshot: 'Stretch', sets_snapshot: 2, timer_seconds_snapshot: 30, notes_snapshot: 'Gentle' }] }));
  const result = await loadPatientRoutine('2026-10-26', ['#9BCBC5']);
  expect(result.routine.name).toBe('Saved routine');
  expect(result.exercises[0]).toMatchObject({ assignmentExerciseId: 'snapshot-one', name: 'Stretch', sets: 2, durationSeconds: 30, detail: 'Gentle' });
  expect(result.upcoming).toEqual([]);
  expect(await loadPatientRoutine('2026-10-27', ['#9BCBC5'])).toEqual({ routine: null, exercises: [], upcoming: [] });
});

test('returns assignments scheduled after today as a soonest-first upcoming preview, excluding cancelled ones', async () => {
  supabase.rpc.mockImplementation(async name => ({ data: name === 'get_my_care_relationships' ? [{ patient_profile_id: 'relationship' }]
    : name === 'get_my_routine_assignments' ? [
      { id: 'later', status: 'scheduled', scheduled_date: '2026-11-02', created_at: '2026-10-20', routine_name_snapshot: 'Later routine' },
      { id: 'sooner', status: 'scheduled', scheduled_date: '2026-10-28', created_at: '2026-10-21', routine_name_snapshot: 'Sooner routine' },
      { id: 'cancelled', status: 'cancelled', scheduled_date: '2026-10-29', created_at: '2026-10-22', routine_name_snapshot: 'Cancelled routine' },
      { id: 'today', status: 'scheduled', scheduled_date: '2026-10-27', created_at: '2026-10-23', routine_name_snapshot: 'Today routine' },
    ] : [] }));
  const result = await loadPatientRoutine('2026-10-27', ['#9BCBC5']);
  expect(result.upcoming).toEqual([
    { id: 'sooner', name: 'Sooner routine', scheduledDate: '2026-10-28', status: 'scheduled' },
    { id: 'later', name: 'Later routine', scheduledDate: '2026-11-02', status: 'scheduled' },
  ]);
});

test('exercisesForAssignment loads and normalizes one assignment\'s prescriptions on demand', async () => {
  supabase.rpc.mockImplementation(async name => ({ data: name === 'get_my_routine_assignment_prescriptions' ? [{ id: 'snapshot-later', exercise_name_snapshot: 'Ankle circles', sets_snapshot: 1, reps_snapshot: 10, notes_snapshot: '' }] : [] }));
  const exercises = await exercisesForAssignment('later', ['#9BCBC5']);
  expect(exercises).toEqual([expect.objectContaining({ assignmentExerciseId: 'snapshot-later', name: 'Ankle circles', sets: 1, reps: 10, type: 'countup' })]);
});


test('feedback read failure retains the assigned prescription and marks feedback unavailable', async () => {
  supabase.rpc.mockImplementation(async name => name === 'get_my_routine_exercise_feedback' ? { error: { message: 'Offline' } } : { data:
    name === 'get_my_care_relationships' ? [{ patient_profile_id: 'relationship' }]
    : name === 'get_my_routine_assignments' ? [{ id: 'assignment', status: 'scheduled', scheduled_date: '2026-10-26', created_at: '2026-10-25', routine_name_snapshot: 'Saved routine' }]
    : [{ id: 'snapshot-one', exercise_name_snapshot: 'Stretch', sets_snapshot: 2 }] });
  const result = await loadPatientRoutine('2026-10-26', ['#9BCBC5']);
  expect(result.exercises[0]).toMatchObject({ name: 'Stretch', sets: 2 });
  expect(result.exercises[0].patientFeedbackError).toMatch(/could not be loaded/);
});

test('lazy-loaded duplicate exercises restore feedback by snapshot UUID', async () => {
  supabase.rpc.mockImplementation(async name => ({ data: name === 'get_my_routine_assignment_prescriptions' ? [
    { id: 'first-snapshot', exercise_name_snapshot: 'Stretch', sets_snapshot: 1 },
    { id: 'second-snapshot', exercise_name_snapshot: 'Stretch', sets_snapshot: 2 },
  ] : [{ routine_assignment_exercise_id: 'second-snapshot', pain_score: 6, feeling: 'difficult', explanation: 'Stiff ankle', reported_at: '2026-11-03T18:00:00Z' }] }));
  const exercises = await exercisesForAssignment('later', ['#9BCBC5']);
  expect(exercises[0].patientFeedback).toBeUndefined();
  expect(exercises[1]).toMatchObject({ assignmentExerciseId: 'second-snapshot', patientFeedback: { painScore: 6, feeling: 'difficult', explanation: 'Stiff ankle' } });
  expect(supabase.rpc).toHaveBeenCalledWith('get_my_routine_exercise_feedback', { p_routine_assignment_id: 'later' });
});
