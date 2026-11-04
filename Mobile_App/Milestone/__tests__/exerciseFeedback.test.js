import React from 'react';
import { TextInput } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { supabase } from '../lib/supabase';
import { loadExerciseFeedback, saveExerciseFeedback, validateExerciseFeedback } from '../lib/exerciseFeedback';
import useExerciseReview from '../lib/useExerciseReview';
import ExerciseReviewFeedback from '../components/ExerciseReviewFeedback';
jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

let renderer, review;
const exercise = { assignmentExerciseId: '00000000-0000-0000-0000-000000000001' };
const row = args => ({ routine_assignment_exercise_id: args.p_routine_assignment_exercise_id, pain_score: args.p_pain_score,
  feeling: args.p_feeling, explanation: args.p_explanation, reported_at: '2026-11-03T18:00:00Z' });
function Harness({ patientId = 'patient-a', enabled = true, visible = true, current = exercise, onSaved }) {
  review = useExerciseReview({ patientId, enabled, assignmentId: 'assignment', visible, exercise: current, onSaved });
  return <ExerciseReviewFeedback review={review} />;
}
const button = label => renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const press = async label => { await act(async () => { await button(label).props.onPress(); }); };
async function mount(props = {}) { await act(async () => { renderer = Renderer.create(<Harness onSaved={jest.fn()} {...props} />); }); }
beforeEach(() => { supabase.rpc.mockReset(); supabase.rpc.mockImplementation(async (name, args) => ({ data: name.startsWith('save_') ? [row(args)] : [] })); });
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); renderer = null; });

test('requires score, feeling and explanation before sending; good discards an old explanation', async () => {
  const onSaved = jest.fn(); await mount({ onSaved });
  await press('Next exercise'); expect(review.error).toMatch(/pain score/);
  await press('Pain 6 out of 10'); await press('Next exercise'); expect(review.error).toMatch(/Choose Good/);
  await press('Exercise felt neutral'); await press('Next exercise'); expect(review.error).toMatch(/Tell your provider why/);
  expect(supabase.rpc).not.toHaveBeenCalled();
  await act(async () => renderer.root.findByType(TextInput).props.onChangeText('Balance was hard.'));
  await press('Next exercise'); expect(onSaved).toHaveBeenCalledTimes(1);
  expect(supabase.rpc.mock.calls[0][1]).toMatchObject({ p_routine_assignment_exercise_id: exercise.assignmentExerciseId, p_pain_score: 6, p_feeling: 'neutral', p_explanation: 'Balance was hard.' });
  await press('Exercise felt good'); expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
  await press('Next exercise'); expect(supabase.rpc.mock.calls[1][1].p_explanation).toBeNull();
});

test('rapid next clicks share one save; failure retains answers and retry succeeds', async () => {
  await mount();
  await press('Pain 8 out of 10'); await press('Exercise felt difficult');
  await act(async () => renderer.root.findByType(TextInput).props.onChangeText('Please review this.'));
  let reject;
  supabase.rpc.mockImplementationOnce(() => new Promise((resolve, failure) => { reject = failure; }));
  let first;
  await act(async () => { first = button('Next exercise').props.onPress(); button('Next exercise').props.onPress(); });
  expect(supabase.rpc).toHaveBeenCalledTimes(1); expect(button('Next exercise').props.disabled).toBe(true);
  await act(async () => { reject(new Error('Offline. Try again.')); await first; });
  expect(review.value).toMatchObject({ painScore: 8, feeling: 'difficult', explanation: 'Please review this.' });
  expect(review.error).toMatch(/Offline/);
  await press('Next exercise'); expect(supabase.rpc).toHaveBeenCalledTimes(2); expect(review.error).toBe('');
});

test('saved ratings hydrate by snapshot ID, including repeated names and reloaded feedback', async () => {
  const feedback = { ...row({ p_routine_assignment_exercise_id: exercise.assignmentExerciseId, p_pain_score: 10, p_feeling: 'neutral', p_explanation: 'Needed breaks.' }) };
  supabase.rpc.mockResolvedValueOnce({ data: [feedback] });
  const saved = await loadExerciseFeedback('assignment');
  await mount({ current: { ...exercise, name: 'Repeated stretch', patientFeedback: saved.get(exercise.assignmentExerciseId) } });
  expect(button('Pain 10 out of 10').props.accessibilityState.selected).toBe(true);
  expect(button('Exercise felt neutral').props.accessibilityState.selected).toBe(true);
  expect(renderer.root.findByType(TextInput).props.value).toBe('Needed breaks.');
  await act(async () => renderer.update(<Harness patientId="patient-a" current={{ assignmentExerciseId: 'different-snapshot', name: 'Repeated stretch' }} onSaved={jest.fn()} />));
  expect(review.value.painScore).toBeNull();
});

test('an account change clears the draft and a late save cannot advance the new patient', async () => {
  const onSaved=jest.fn(); await mount({ onSaved });
  await press('Pain 2 out of 10'); await press('Exercise felt good');
  let resolve, submitted;
  supabase.rpc.mockImplementationOnce((name,args) => { submitted=args; return new Promise(done => { resolve=done; }); });
  let first; await act(async () => { first=button('Next exercise').props.onPress(); });
  await act(async () => renderer.update(<Harness patientId="patient-b" current={{ assignmentExerciseId: 'other-exercise' }} onSaved={onSaved} />));
  await act(async () => { resolve({ data:[row(submitted)] }); await first; });
  expect(review.value.painScore).toBeNull(); expect(review.saving).toBe(false); expect(onSaved).not.toHaveBeenCalled();
});

test('leaving review during a save does not navigate on success; returning retains the saved response', async () => {
  const onSaved=jest.fn(); await mount({ onSaved });
  await press('Pain 1 out of 10'); await press('Exercise felt good');
  let resolve, submitted;
  supabase.rpc.mockImplementationOnce((name,args) => { submitted=args; return new Promise(done => { resolve=done; }); });
  let first; await act(async () => { first=button('Next exercise').props.onPress(); });
  await act(async () => renderer.update(<Harness visible={false} onSaved={onSaved} />));
  await act(async () => { resolve({ data:[row(submitted)] }); await first; });
  expect(onSaved).not.toHaveBeenCalled(); expect(review.value.painScore).toBe(1);
});

test('bounds, malformed receipts and long explanations fail without silent success', async () => {
  for (const painScore of [null,0,11,1.5]) expect(() => validateExerciseFeedback({ painScore, feeling:'good' })).toThrow();
  expect(() => validateExerciseFeedback({painScore:1,feeling:'neutral',explanation:'x'.repeat(4001)})).toThrow();
  expect(validateExerciseFeedback({painScore:10,feeling:'good',explanation:'discard'}).explanation).toBeNull();
  supabase.rpc.mockResolvedValueOnce({data:[]});
  await expect(saveExerciseFeedback(exercise.assignmentExerciseId,{painScore:1,feeling:'good'})).rejects.toThrow(/verified/);
});


test('failed feedback reads offer retry without losing a newly entered answer', async () => {
  await mount({ current: { ...exercise, patientFeedbackError: 'Saved feedback unavailable' } });
  await press('Pain 4 out of 10');
  supabase.rpc.mockResolvedValueOnce({ data: [row({ p_routine_assignment_exercise_id: exercise.assignmentExerciseId, p_pain_score: 8, p_feeling: 'neutral', p_explanation: 'Old response' })] });
  await press('Retry saved exercise feedback');
  expect(review.readError).toBe('');
  expect(review.value.painScore).toBe(4);
});
