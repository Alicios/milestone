import { loadPatientRoutine } from '../lib/patientRoutine';
import { supabase } from '../lib/supabase';
jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
test('loads only today’s scheduled assignment and uses its prescription snapshots', async () => {
  supabase.rpc.mockImplementation(async name => ({ data: name === 'get_my_care_relationships' ? [{ patient_profile_id: 'relationship' }]
    : name === 'get_my_routine_assignments' ? [{ id: 'assignment', status: 'scheduled', scheduled_date: '2026-10-26', created_at: '2026-10-25', routine_name_snapshot: 'Saved routine' }]
    : [{ exercise_name_snapshot: 'Stretch', sets_snapshot: 2, timer_seconds_snapshot: 30, notes_snapshot: 'Gentle' }] }));
  const result = await loadPatientRoutine('2026-10-26', ['#9BCBC5']);
  expect(result.routine.name).toBe('Saved routine');
  expect(result.exercises[0]).toMatchObject({ name: 'Stretch', sets: 2, durationSeconds: 30, detail: 'Gentle' });
  expect(await loadPatientRoutine('2026-10-27', ['#9BCBC5'])).toEqual({ routine: null, exercises: [] });
});
