// Older saved routines contain names; newer ones contain prescription objects.
// Catalog metadata is optional: a saved exercise must not disappear without a UUID.
export function parseExerciseList(value) {
  const list = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(list) || !list.length) {
    throw new Error('This assigned routine has no exercises. Ask your provider to review it.');
  }
  return list.map(item => {
    const exercise = typeof item === 'string' ? {name: item} : item;
    if (!exercise || typeof exercise !== 'object' || Array.isArray(exercise)) {
      throw new Error('This assigned routine contains an invalid exercise. Ask your provider to review it.');
    }
    return exercise;
  });
}

function positiveInteger(value, label, fallback) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!['number', 'string'].includes(typeof value) || !Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`The assigned exercise has an invalid ${label}. Ask your provider to review it.`);
  }
  return number;
}

export function normalizeAssignedExercises(list, catalog, accents) {
  return list.map((item, index) => {
    const savedName = item.name ?? item.exerciseName ?? item.title;
    const matches = catalog.filter(exercise => item.exercise_id
      ? String(exercise.id) === String(item.exercise_id)
      : exercise.name === savedName);
    const details = matches.length === 1 ? matches[0] : null;
    const name = savedName ?? details?.name;
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('An assigned exercise has no name. Ask your provider to review it.');
    }
    const sets = positiveInteger(item.sets, 'set count', 1);
    const reps = positiveInteger(item.reps, 'repetition count', null);
    const durationSeconds = positiveInteger(item.duration_seconds ?? item.timer, 'duration', null);
    const detail = item.notes ?? details?.desc ?? '';
    return {
      id: `${index}:${item.exercise_id ?? name}`,
      name,
      detail,
      overview: detail,
      accent: accents[index % accents.length],
      type: durationSeconds === null ? 'countup' : 'countdown',
      durationSeconds,
      sets,
      reps,
      estimatedSeconds: durationSeconds === null ? 60 * sets : durationSeconds * sets,
    };
  });
}
