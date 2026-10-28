import { AppError } from './errors'
import type { ExercisePrescription } from '../types'

// PostgreSQL integer range; this is a storage limit, not a clinical recommendation.
export const MAX_PRESCRIPTION_INTEGER = 2147483647
export const validPrescriptionInteger = (value: unknown): value is number | null | undefined =>
  value == null || (typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_PRESCRIPTION_INTEGER)

export function validPrescriptionText(value = '') {
  return value.trim() === '' || (/^\d+$/.test(value.trim()) && validPrescriptionInteger(Number(value)))
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
