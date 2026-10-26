import {parseExerciseList, normalizeAssignedExercises} from '../lib/assignedExercises';

const normalize = (value, catalog = []) => normalizeAssignedExercises(parseExerciseList(value), catalog, ['teal']);

test('Frank lower body routine retains both legacy names without catalog IDs', () => {
  const result = normalize(['Leg Stretch', 'Calf Stretch']);
  expect(result.map(exercise => exercise.name)).toEqual(['Leg Stretch', 'Calf Stretch']);
  expect(result.every(exercise => exercise.type === 'countup')).toBe(true);
  expect(result[0].reps).toBeNull();
});

test('catalog metadata enriches named exercises without replacing saved names or order', () => {
  const result = normalize(['Leg Stretch', 'Calf Stretch'], [
    {id: 'calf', name: 'Calf Stretch', desc: 'Calf instructions'},
    {id: 'leg', name: 'Leg Stretch', desc: 'Leg instructions'},
  ]);
  expect(result.map(exercise => exercise.overview)).toEqual(['Leg instructions', 'Calf instructions']);
});

test('prescription objects use duration_seconds, sets, reps and provider notes', () => {
  const [exercise] = normalize([{exercise_id: 'leg', name: 'Assigned name', sets: 2, reps: 3, duration_seconds: 30, notes: 'Go slowly'}]);
  expect(exercise).toMatchObject({name: 'Assigned name', sets: 2, reps: 3, durationSeconds: 30, type: 'countdown', overview: 'Go slowly', estimatedSeconds: 60});
});

test('ID-only objects resolve catalog names and repeated IDs stay separate', () => {
  const result = normalize([{exercise_id: 'leg'}, {exercise_id: 'leg', timer: 20}], [{id: 'leg', name: 'Leg Stretch', desc: 'Instructions'}]);
  expect(result.map(exercise => exercise.name)).toEqual(['Leg Stretch', 'Leg Stretch']);
  expect(result[0].id).not.toBe(result[1].id);
  expect(result[1].durationSeconds).toBe(20);
});

test('missing or ambiguous catalog records do not discard named exercises or pick arbitrary instructions', () => {
  expect(normalize([{exercise_id: 'removed', name: 'Saved exercise'}])[0].name).toBe('Saved exercise');
  expect(normalize(['Stretch'], [{id: 'a', name: 'Stretch', desc: 'A'}, {id: 'b', name: 'Stretch', desc: 'B'}])[0].detail).toBe('');
});

test('JSON list and legacy name aliases are supported', () => {
  expect(normalize(JSON.stringify([{exerciseName: 'A'}, {title: 'B'}])).map(exercise => exercise.name)).toEqual(['A', 'B']);
});

test.each([[], null, [null], [17], [' '], [{exercise_id: 'missing'}]])('invalid assigned content surfaces an error: %p', value => {
  expect(() => normalize(value)).toThrow(/assigned routine|assigned exercise/);
});

test.each([0, -1, 1.5, 'bad', true])('invalid prescribed values cannot start a broken timer: %p', value => {
  expect(() => normalize([{name: 'Stretch', duration_seconds: value}])).toThrow(/invalid duration/);
});
