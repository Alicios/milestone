import { AppError } from './errors'
import type { ExercisePrescription } from '../types'

// PostgreSQL integer range; this is a storage limit, not a clinical recommendation.
export const MAX_PRESCRIPTION_INTEGER = 2147483647
export const validPrescriptionInteger = (value: unknown): value is number | null | undefined =>
  value == null || (typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_PRESCRIPTION_INTEGER)

export function validPrescriptionText(value = '') {
  return value.trim() === '' || (/^\d+$/.test(value.trim()) && validPrescriptionInteger(Number(value)))
}

// Clinically plausible UI bounds for a NEW or edited value in the routine
// editor — tighter than the storage-only ceiling above, so a typo like an
// extra zero ("5000" reps) is caught before it reaches a patient, without
// changing how already-saved data (read via validPrescriptionInteger, which
// only had to satisfy the broader storage limit) is loaded or displayed.
export const PRESCRIPTION_FIELD_BOUNDS = {
  sets: { max: 20, label: 'Sets' },
  reps: { max: 500, label: 'Reps' },
  durationSeconds: { max: 3600, label: 'Duration (seconds)' },
} as const

export function validPrescriptionFieldText(field: keyof typeof PRESCRIPTION_FIELD_BOUNDS, value = '') {
  if (value.trim() === '') return true
  if (!/^\d+$/.test(value.trim())) return false
  const number = Number(value)
  return validPrescriptionInteger(number) && number <= PRESCRIPTION_FIELD_BOUNDS[field].max
}

export function parsePrescriptionText(value = ''): number | null {
  if (!validPrescriptionText(value)) throw new AppError('VALIDATION_ERROR', { message: 'Use a positive whole number or leave the field blank.' })
  return value.trim() ? Number(value) : null
}

export function prescriptionSummary(exercise: ExercisePrescription) {
  return [
    exercise.sets != null ? `${exercise.sets} sets` : '',
    exercise.reps != null ? `${exercise.reps} reps` : '',
    exercise.durationSeconds != null ? `${exercise.durationSeconds} seconds` : '',
  ].filter(Boolean).join(' · ')
}
