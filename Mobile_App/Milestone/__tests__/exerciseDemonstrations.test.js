import { exercisesForAssignment } from '../lib/patientRoutine';
import { normalizeDemonstrations } from '../lib/exerciseDemonstrations';
import { supabase } from '../lib/supabase';
jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

test('assignment demonstrations use snapshot IDs, preserve prescriptions and notes, and supply missing instructions', async () => {
  supabase.rpc.mockImplementation(async name => ({ data: name === 'get_my_routine_assignment_prescriptions' ? [
    { id: 'one', exercise_name_snapshot: 'Saved name', sets_snapshot: 3, reps_snapshot: 8, notes_snapshot: 'Provider instructions' },
    { id: 'two', exercise_name_snapshot: 'Saved name', sets_snapshot: 2, timer_seconds_snapshot: 20, notes_snapshot: '' },
  ] : name === 'get_my_routine_assignment_media' ? [
    { assignment_exercise_id: 'two', exercise_id: 'catalog-two', instructions: 'Catalog instructions', media: [{ kind: 'image', url: '/exercise-media/leg-press.png', title: 'Picture' }] },
    { assignment_exercise_id: 'one', exercise_id: 'catalog-one', instructions: 'Other instructions', media: [{ kind: 'video-link', url: 'https://youtu.be/abcdefghijk', preview: { kind: 'embed', url: 'https://www.youtube-nocookie.com/embed/abcdefghijk' } }] },
  ] : [] }));
  const result = await exercisesForAssignment('assignment', ['#fff']);
  expect(result[0]).toMatchObject({ id: 'one', name: 'Saved name', sets: 3, reps: 8, overview: 'Provider instructions', routineAssignmentId: 'assignment', catalogExerciseId: 'catalog-one', media: [{ kind: 'video-link' }] });
  expect(result[1]).toMatchObject({ id: 'two', name: 'Saved name', sets: 2, durationSeconds: 20, overview: 'Catalog instructions', media: [{ url: '/exercise-media/leg-press.png' }] });
  expect(supabase.rpc).toHaveBeenCalledWith('get_my_routine_assignment_media', { p_routine_assignment_id: 'assignment' });
});

test('a failed media request preserves the routine and allows an independent retry', async () => {
  supabase.rpc.mockImplementation(async name => name === 'get_my_routine_assignment_media' ? { error: { message: 'Offline' } } : { data: name === 'get_my_routine_assignment_prescriptions' ? [{ id: 'one', exercise_name_snapshot: 'Stretch', sets_snapshot: 2 }] : [] });
  const [exercise] = await exercisesForAssignment('assignment', ['#fff']);
  expect(exercise).toMatchObject({ name: 'Stretch', sets: 2, media: [], mediaError: expect.stringContaining('retry'), patientFeedbackError: '' });
});

test('unsupported or insecure media never becomes an inline player', () => {
  const result = normalizeDemonstrations([
    { kind: 'image', url: '/exercise-media/../../secret.png' },
    { kind: 'image', url: 'http://example.invalid/picture.png' },
    { kind: 'video-link', url: 'https://example.invalid/watch', preview: { kind: 'embed', url: 'https://www.youtube-nocookie.com.evil.invalid/embed/a' } },
    { kind: 'video-link', url: 'https://example.invalid/watch', preview: { kind: 'video', url: 'https://example.invalid/video.mp4' } },
  ]);
  expect(result).toHaveLength(2);
  expect(result[0].preview).toBeUndefined();
  expect(result[1].preview.kind).toBe('video');
});
