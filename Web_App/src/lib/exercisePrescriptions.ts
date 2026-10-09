import type { Prescription, Routine, RoutineExercise } from '../types'

export const prescriptionBounds = { sets: 100, reps: 1000, timerSeconds: 86400 } as const
export const maxRoutineExercises = 100
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const validParameter = (value: unknown, max: number) => value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max)

export interface PrescriptionDraft {
  key: string
  exerciseId: string | null
  originalName?: string
  original?: unknown
  sets: string
  reps: string
  timerSeconds: string
}

export function decodeRoutine(row: { id: string; name: string; exercise_list: unknown; exercise_format_version?: number; exercise_revision?: number }): Routine {
  const version = row.exercise_format_version ?? 0
  // Never filter entries: even null/scalar/malformed data must remain visible.
  const entries = Array.isArray(row.exercise_list) ? row.exercise_list : row.exercise_list == null ? [] : [row.exercise_list]
  const exercises: RoutineExercise[] = entries.map((entry, position) => {
    const object = record(entry) ? entry : {}
    const candidateName = typeof entry === 'string' ? entry : [object.name, object.exerciseName, object.title].find((value) => typeof value === 'string' && value.trim())
    const name = typeof candidateName === 'string' && candidateName.trim() ? candidateName : `Unrecognized exercise ${position + 1}`
    const resolved = version === 1 && record(entry)
      && Object.keys(entry).every((key) => ['exercise_id', 'name', 'sets', 'reps', 'timer_seconds'].includes(key))
      && typeof object.exercise_id === 'string' && uuidPattern.test(object.exercise_id)
      && typeof object.name === 'string' && Boolean(object.name.trim())
      && validParameter(object.sets, prescriptionBounds.sets)
      && validParameter(object.reps, prescriptionBounds.reps)
      && validParameter(object.timer_seconds, prescriptionBounds.timerSeconds)
    return {
      id: `${row.id}-${position}`, name, position, resolved, original: entry,
      exerciseId: resolved ? String(object.exercise_id) : null,
      sets: resolved ? object.sets as number | null : null,
      reps: resolved ? object.reps as number | null : null,
      timerSeconds: resolved ? object.timer_seconds as number | null : null,
    }
  })
  const assignmentIssue = !exercises.length ? 'Add at least one exercise before assigning this draft.'
    : version !== 1 || exercises.some((exercise) => !exercise.resolved) ? 'Open Saved routines and replace unresolved entries using the catalog.'
      : exercises.length > maxRoutineExercises ? 'This routine exceeds the exercise limit.' : null
  return { id: row.id, name: row.name, exercises, exerciseFormatVersion: version, exerciseRevision: row.exercise_revision ?? null, assignmentIssue }
}

export function toPrescriptionDraft(exercise: RoutineExercise): PrescriptionDraft {
  return {
    key: exercise.id, exerciseId: exercise.exerciseId,
    originalName: exercise.resolved ? undefined : exercise.name,
    original: exercise.resolved ? undefined : exercise.original,
    sets: exercise.sets?.toString() ?? '', reps: exercise.reps?.toString() ?? '', timerSeconds: exercise.timerSeconds?.toString() ?? '',
  }
}

export function parseParameter(value: string, label: string, max: number): number | null {
  if (!value.trim()) return null
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > max) {
    throw new Error(`${label} must be a whole number from 1 to ${max}, or left blank.`)
  }
  return Number(value)
}

export function buildPrescriptionPayload(name: string, exercises: PrescriptionDraft[], catalogIds: ReadonlySet<string>) {
  if (!name.trim() || Array.from(name.trim()).length > 200) throw new Error('Routine name must contain 1–200 characters.')
  if (exercises.length > maxRoutineExercises) throw new Error('A routine supports at most 100 exercises.')
  return exercises.map((exercise) => {
    if (!exercise.exerciseId || !uuidPattern.test(exercise.exerciseId) || !catalogIds.has(exercise.exerciseId)) {
      throw new Error('Choose a catalog exercise for every entry, or explicitly remove it before saving.')
    }
    return {
      exercise_id: exercise.exerciseId,
      sets: parseParameter(exercise.sets, 'Sets', prescriptionBounds.sets),
      reps: parseParameter(exercise.reps, 'Repetitions', prescriptionBounds.reps),
      timer_seconds: parseParameter(exercise.timerSeconds, 'Timer seconds', prescriptionBounds.timerSeconds),
    }
  })
}

export type PrescriptionInput = ReturnType<typeof buildPrescriptionPayload>[number]

export function prescriptionSummary(exercise: Prescription): string {
  return [exercise.sets != null && `${exercise.sets} sets`, exercise.reps != null && `${exercise.reps} reps per set`, exercise.timerSeconds != null && `${exercise.timerSeconds} sec per set`].filter(Boolean).join(' · ')
}

export function errorMessage(error: unknown, fallback: string) {
  return record(error) && typeof error.message === 'string' ? error.message : fallback
}
