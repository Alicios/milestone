import { AppError, normalizeError } from './errors'
import { supabase } from './supabase'
import type { EditableUserFields, FollowUpAppointment, MedicalPractice, Routine, RoutineAssignment, RoutineAssignmentStatus, RoutineExercise, RoutineExerciseInput, User } from '../types'
import { validPrescriptionInteger } from './prescriptions'
import type { Patient } from '../data/mockPatients'

export const PROFILE_IMAGE_BUCKET = 'profile-images'

type ProviderRow = {
  id: string
  name: string
  professional_title?: string
  role?: string
  initials: string
  contact_email: string
  avatar_url: string
  phone: string
  bio: string
  medical_practice_id: string | null
  medical_practices?: Pick<MedicalPractice, 'id' | 'name'> | null
  facility: string
  office_location: string
  work_phone: string
  work_phone_extension: string
  preferred_contact: User['preferredContact']
}

type SchemaError = { code?: string; message?: string; details?: string; hint?: string }

function isMissingSchemaObject(error: SchemaError | null, identifiers: string[]) {
  if (!error || !['42703', '42P01', 'PGRST204', 'PGRST205'].includes(error.code ?? '')) return false
  const context = [error.message, error.details, error.hint].filter(Boolean).join(' ').toLowerCase()
  return identifiers.some((identifier) => context.includes(identifier.toLowerCase()))
}

function toUser(provider: ProviderRow, authEmail: string): User {
  return {
    id: provider.id,
    name: provider.name,
    email: authEmail || provider.contact_email,
    professionalTitle: provider.professional_title ?? provider.role ?? '',
    initials: provider.initials,
    avatarUrl: provider.avatar_url,
    phone: provider.phone,
    bio: provider.bio,
    medicalPracticeId: provider.medical_practice_id ?? '',
    medicalPracticeName: provider.medical_practices?.name ?? '',
    facility: provider.facility,
    officeLocation: provider.office_location,
    workPhone: provider.work_phone,
    workPhoneExtension: provider.work_phone_extension,
    preferredContact: provider.preferred_contact,
  }
}

export async function loadProvider(userId: string, authEmail = '') {
  try {
    const { data, error, status: errorStatus } = await supabase.from('providers').select('*, medical_practices(id, name)').eq('id', userId).single()
    if (error) throw normalizeError(error, { operation: 'loadProvider', status: errorStatus })
    return toUser(data as ProviderRow, authEmail)
  } catch (error) {
    throw normalizeError(error, { operation: 'loadProvider' })
  }
}

export async function loadMedicalPractices(): Promise<MedicalPractice[]> {
  try {
    const { data, error, status: errorStatus } = await supabase.from('medical_practices').select('id, name, description').order('name')
    if (error) throw normalizeError(error, { operation: 'loadMedicalPractices', status: errorStatus })
    return data as MedicalPractice[]
  } catch (error) {
    throw normalizeError(error, { operation: 'loadMedicalPractices' })
  }
}

export async function updateProvider(userId: string, profile: EditableUserFields) {
  try {
    const sharedUpdate = {
      name: profile.name,
      contact_email: profile.email,
      phone: profile.phone,
      bio: profile.bio,
      avatar_url: profile.avatarUrl,
      medical_practice_id: profile.medicalPracticeId || null,
      facility: profile.facility,
      office_location: profile.officeLocation,
      work_phone: profile.workPhone,
      work_phone_extension: profile.workPhoneExtension,
      preferred_contact: profile.preferredContact,
    }
    const currentResult = await supabase.from('providers').update({
      ...sharedUpdate,
      professional_title: profile.professionalTitle,
    }).eq('id', userId).select('*, medical_practices(id, name)').single()
    if (!currentResult.error) return currentResult.data as ProviderRow
    if (!isMissingSchemaObject(currentResult.error, ['professional_title'])) throw normalizeError(currentResult.error, { operation: 'updateProvider', status: currentResult.status })

    const legacyResult = await supabase.from('providers').update({
      ...sharedUpdate,
      role: profile.professionalTitle,
    }).eq('id', userId).select('*, medical_practices(id, name)').single()
    if (legacyResult.error) throw normalizeError(legacyResult.error, { operation: 'updateProvider', status: legacyResult.status })
    return legacyResult.data as ProviderRow
  } catch (error) {
    throw normalizeError(error, { operation: 'updateProvider' })
  }
}

export async function uploadProviderAvatar(userId: string, file: File) {
  try {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    if (!authData.user) throw new AppError('AUTH_REQUIRED')
    if (authData.user.id !== userId) {
      throw new AppError('FORBIDDEN')
    }
    const path = `${authData.user.id}/avatar`
    const { error } = await supabase.storage.from(PROFILE_IMAGE_BUCKET).upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: true,
    })
    if (error) throw error
    return supabase.storage.from(PROFILE_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
  } catch (error) {
    throw normalizeError(error, { operation: 'uploadProviderAvatar' })
  }
}

type PatientProfileRow = { id: string; patient_id: string }
export type PatientRow = { id: string; name: string; email?: string | null; phone?: string | null; primary_concern?: string | null; treatment_focus?: string | null; start_of_care?: string | null; care_status?: Patient['careStatus'] | null; auth_user_id?: string | null; pending_otp_code?: string | null; pending_otp_expires_at?: string | null }
type StatusRow = { patient_profile_id: string; day_index: number; status: Patient['statuses'][number] }

export async function loadPatients(providerId: string): Promise<Patient[]> {
  try {
    const { data: profiles, error: profileError, status: profileStatus } = await supabase
      .from('provider_patient_profiles')
      .select('id, patient_id')
      .eq('provider_id', providerId)
      .is('discharged_at', null)
    if (profileError) throw normalizeError(profileError, { operation: 'loadPatients', status: profileStatus })

    const profileRows = (profiles ?? []) as PatientProfileRow[]
    if (!profileRows.length) return []
    const patientIds = profileRows.map((profile) => profile.patient_id)
    const profileIds = profileRows.map((profile) => profile.id)

    const extendedPatientQuery = await supabase.from('patients').select('id, name, email, phone, primary_concern, treatment_focus, start_of_care, care_status, auth_user_id, pending_otp_code, pending_otp_expires_at').in('id', patientIds)
    const patientQuery = extendedPatientQuery.error?.code === '42703'
      ? await supabase.from('patients').select('id, name').in('id', patientIds)
      : extendedPatientQuery
    const [{ data: patients, error: patientError, status: patientStatus }, { data: statuses, error: statusError, status: statusStatus }] = [patientQuery, await supabase.from('patient_statuses').select('patient_profile_id, day_index, status').in('patient_profile_id', profileIds)]
    if (patientError) throw normalizeError(patientError, { operation: 'loadPatients', status: patientStatus })
    if (statusError) throw normalizeError(statusError, { operation: 'loadPatients', status: statusStatus })

    const statusByProfile = new Map<string, StatusRow[]>()
    for (const status of (statuses ?? []) as StatusRow[]) {
      const current = statusByProfile.get(status.patient_profile_id) ?? []
      current.push(status)
      statusByProfile.set(status.patient_profile_id, current)
    }

    return ((patients ?? []) as PatientRow[]).map((patient) => {
      const profile = profileRows.find((item) => item.patient_id === patient.id)
      const patientStatuses: Patient['statuses'] = Array(7).fill('none')
      for (const status of profile ? statusByProfile.get(profile.id) ?? [] : []) {
        if (status.day_index >= 0 && status.day_index < 7) patientStatuses[status.day_index] = status.status
      }
      return {
        id: patient.id,
        profileId: profile?.id ?? '',
        name: patient.name,
        careStatus: patient.care_status ?? 'active',
        email: patient.email ?? undefined,
        phone: patient.phone ?? undefined,
        primaryConcern: patient.primary_concern ?? undefined,
        treatmentFocus: patient.treatment_focus ?? undefined,
        startOfCare: patient.start_of_care ?? undefined,
        hasAccount: Boolean(patient.auth_user_id),
        pendingOtpCode: patient.pending_otp_code ?? undefined,
        pendingOtpExpiresAt: patient.pending_otp_expires_at ?? undefined,
        statuses: patientStatuses,
      }
    })
  } catch (error) {
    throw normalizeError(error, { operation: 'loadPatients' })
  }
}

export interface PatientDetailsInput {
  name: string
  email: string
  phone: string
  primaryConcern: string
  treatmentFocus: string
  startOfCare: string
  careStatus: 'active' | 'pending'
}

export function validatePatientDetails(input: PatientDetailsInput) {
  const errors: Partial<Record<keyof PatientDetailsInput, string>> = {}
  if (!input.name.trim() || input.name.trim().length > 200) errors.name = 'Enter a name of 1 to 200 characters.'
  if (input.email.trim() && (input.email.trim().length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()))) errors.email = 'Enter a valid email address.'
  const phone = input.phone.trim()
  if (phone && (phone.length > 64 || !/^\+?[0-9 ().-]+$/.test(phone) || !/^[0-9]{7,15}$/.test(phone.replace(/\D/g, '')))) errors.phone = 'Enter a phone number with 7 to 15 digits.'
  if (input.primaryConcern.trim().length > 4000) errors.primaryConcern = 'Use 4000 characters or fewer.'
  if (input.treatmentFocus.trim().length > 4000) errors.treatmentFocus = 'Use 4000 characters or fewer.'
  if (input.startOfCare && (!/^\d{4}-\d{2}-\d{2}$/.test(input.startOfCare) || !Number.isFinite(Date.parse(input.startOfCare)) || new Date(input.startOfCare).toISOString().slice(0, 10) !== input.startOfCare)) errors.startOfCare = 'Enter a valid date.'
  if (!['active', 'pending'].includes(input.careStatus)) errors.careStatus = 'Choose Active or Pending.'
  return errors
}

export async function updatePatientDetails(patientId: string, input: PatientDetailsInput): Promise<PatientRow> {
  try {
    const errors = validatePatientDetails(input)
    if (Object.keys(errors).length) throw new AppError('VALIDATION_ERROR', { message: Object.values(errors)[0], details: { fieldErrors: Object.fromEntries(Object.keys(errors).map(field => [field, 'INVALID'])) } })
    const optional = (value: string) => value.trim() || null
    const { data, error, status } = await supabase.rpc('update_patient_details', {
      p_patient_id: patientId, p_name: input.name.trim(), p_email: optional(input.email),
      p_phone: optional(input.phone), p_primary_concern: optional(input.primaryConcern),
      p_treatment_focus: optional(input.treatmentFocus), p_start_of_care: optional(input.startOfCare), p_care_status: input.careStatus,
    }).single()
    if (error) throw normalizeError(error, { operation: 'updatePatientDetails', status })
    const saved = data as PatientRow | null
    if (!saved?.id) throw new AppError('UNEXPECTED_ERROR', { message: 'The saved patient could not be loaded. Refresh the patient page before retrying.' })
    return saved
  } catch (error) {
    throw normalizeError(error, { operation: 'updatePatientDetails' })
  }
}

export async function createPatient(name: string, email: string) {
  try {
    if (typeof name !== 'string' || !name.trim()) throw new AppError('VALIDATION_ERROR', { message: 'Patient name is required.', details: { fieldErrors: { name: 'REQUIRED' } } })
    if (typeof email !== 'string' || !email.trim()) throw new AppError('VALIDATION_ERROR', { message: 'Patient email is required.', details: { fieldErrors: { email: 'REQUIRED' } } })
    const { data, error, status: errorStatus } = await supabase.rpc('create_patient', { patient_name: name.trim(), patient_phone: null, patient_email: email.trim() })
    if (error) throw normalizeError(error, { operation: 'createPatient', status: errorStatus })
    return data as string
  } catch (error) {
    throw normalizeError(error, { operation: 'createPatient' })
  }
}

// Thrown by inviteExistingPatient/createPatientAndInvite so callers can tell
// "the patient record exists, but code generation failed" apart from an outright
// creation failure (the patientId lets the UI point at a retry, if one exists).
export class PatientInviteError extends AppError {
  declare readonly patientId: string
  constructor(patientId: string, error: unknown) {
    const normalized = normalizeError(error, { operation: 'inviteExistingPatient' })
    super(normalized.code, {
      message: normalized.code === 'UNEXPECTED_ERROR'
        ? 'The login code could not be confirmed. The patient record is saved; check their patient page before generating another code. Do not create another patient.'
        : normalized.message,
      cause: normalized, sourceCode: normalized.sourceCode, httpStatus: normalized.httpStatus,
    })
    this.name = 'PatientInviteError'
    Object.defineProperty(this, 'patientId', { value: patientId })
  }
}

export type PatientLoginCode = { email: string; otp: string; expiresAt: string }

// Calls the Vercel serverless function in api/invite-patient.ts, which holds
// the service_role key server-side — the browser can never call Supabase's
// Admin API (generateLink) directly. Returns the raw one-time code: no email
// is sent, so the provider must relay it to the patient directly.
export async function inviteExistingPatient(patientId: string, fetchImpl: typeof fetch = fetch): Promise<PatientLoginCode> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) throw error
    if (!session) throw new AppError('AUTH_REQUIRED')
    const response = await fetchImpl('/api/invite-patient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ patientId }),
    })
    let result: unknown
    try { result = await response.json() }
    catch (error) {
      if (response.ok) throw new AppError('OTP_UNCONFIRMED', { cause: error, httpStatus: response.status })
      result = error
    }
    if (!response.ok) throw normalizeError(result, { operation: 'inviteExistingPatient', status: response.status })
    // Validate the success payload without treating endpoint text as a public message.
    if (!result || typeof result !== 'object'
      || !('email' in result) || typeof result.email !== 'string' || !result.email.trim()
      || !('otp' in result) || typeof result.otp !== 'string' || !/^\d+$/.test(result.otp)
      || !('expiresAt' in result) || typeof result.expiresAt !== 'string' || !Number.isFinite(Date.parse(result.expiresAt))) {
      throw new AppError('OTP_UNCONFIRMED', { cause: result, httpStatus: response.status })
    }
    return { email: result.email, otp: result.otp, expiresAt: result.expiresAt }
  } catch (error) {
    throw new PatientInviteError(patientId, error)
  }
}

export async function createPatientAndInvite(name: string, email: string, fetchImpl: typeof fetch = fetch) {
  const patientId = await createPatient(name, email)
  const code = await inviteExistingPatient(patientId, fetchImpl)
  return { patientId, code }
}

export async function dischargePatient(patientId: string) {
  try {
    const { error, status: errorStatus } = await supabase.rpc('discharge_patient', { patient_id: patientId })
    if (error) throw normalizeError(error, { operation: 'dischargePatient', status: errorStatus })
  } catch (error) {
    throw normalizeError(error, { operation: 'dischargePatient' })
  }
}

type RoutineRow = { id: string; name: string; exercise_list: unknown[] | null }
type RoutineExerciseRow = { id: string; routine_id: string; name: string; position: number }
type RoutineAssignmentRow = {
  id: string
  patient_profile_id: string
  routine_id: string
  scheduled_date: string
  status: RoutineAssignmentStatus
  routine_name_snapshot: string
}
type AssignmentExerciseRow = {
  id: string; routine_assignment_id: string; exercise_name_snapshot: string; position: number
  sets_snapshot?: number | null; reps_snapshot?: number | null
  timer_seconds_snapshot?: number | null; notes_snapshot?: string | null
  exercise_id_snapshot?: string | null
}
type LegacyAssignmentExerciseRow = { id: string; routine_assignment_id: string; name: string; position: number }
type RoutineFollowUpRow = { id: string; routine_assignment_id: string; scheduled_at: string; status: FollowUpAppointment['status'] }

function toExercise(row: RoutineExerciseRow | AssignmentExerciseRow): RoutineExercise {
  const name = 'exercise_name_snapshot' in row ? row.exercise_name_snapshot : row.name
  const snapshot = row as AssignmentExerciseRow
  return { id: row.id, name, position: row.position, sets: snapshot.sets_snapshot ?? null,
    reps: snapshot.reps_snapshot ?? null, durationSeconds: snapshot.timer_seconds_snapshot ?? null,
    notes: snapshot.notes_snapshot ?? null,
    ...('exercise_id_snapshot' in snapshot ? { exerciseId: snapshot.exercise_id_snapshot } : {}) }
}

async function loadAssignmentExerciseSnapshots(assignmentIds: string[]) {
  const fields = 'id, routine_assignment_id, exercise_name_snapshot, position, sets_snapshot, reps_snapshot, timer_seconds_snapshot, notes_snapshot'
  let prescriptionResult: { data: AssignmentExerciseRow[] | null; error: SchemaError | null; status?: number } = await supabase
    .from('routine_assignment_exercises')
    .select(`${fields}, exercise_id_snapshot`)
    .in('routine_assignment_id', assignmentIds)
    .order('position')
  if (isMissingSchemaObject(prescriptionResult.error, ['exercise_id_snapshot'])) {
    prescriptionResult = await supabase.from('routine_assignment_exercises').select(fields)
      .in('routine_assignment_id', assignmentIds).order('position')
  }
  if (!prescriptionResult.error) return (prescriptionResult.data ?? []) as AssignmentExerciseRow[]
  // Read compatibility before deployment. Never use a write fallback that loses prescriptions.
  if (!isMissingSchemaObject(prescriptionResult.error, ['sets_snapshot', 'reps_snapshot', 'timer_seconds_snapshot', 'notes_snapshot', 'exercise_name_snapshot'])) throw normalizeError(prescriptionResult.error, { operation: 'loadRoutineAssignments', status: prescriptionResult.status })
  const currentResult = await supabase
    .from('routine_assignment_exercises')
    .select('id, routine_assignment_id, exercise_name_snapshot, position')
    .in('routine_assignment_id', assignmentIds)
    .order('position')
  if (!currentResult.error) return (currentResult.data ?? []) as AssignmentExerciseRow[]
  if (!isMissingSchemaObject(currentResult.error, ['exercise_name_snapshot'])) throw normalizeError(currentResult.error, { operation: 'loadRoutineAssignments', status: currentResult.status })

  const legacyResult = await supabase
    .from('routine_assignment_exercises')
    .select('id, routine_assignment_id, name, position')
    .in('routine_assignment_id', assignmentIds)
    .order('position')
  if (legacyResult.error) throw normalizeError(legacyResult.error, { operation: 'loadRoutineAssignments', status: legacyResult.status })
  return ((legacyResult.data ?? []) as LegacyAssignmentExerciseRow[]).map((exercise) => ({
    id: exercise.id,
    routine_assignment_id: exercise.routine_assignment_id,
    exercise_name_snapshot: exercise.name,
    position: exercise.position,
  }))
}

async function loadRoutineFollowUps(assignmentIds: string[]) {
  const currentResult = await supabase
    .from('routine_follow_ups')
    .select('id, routine_assignment_id, scheduled_at, status')
    .in('routine_assignment_id', assignmentIds)
  if (!currentResult.error) return (currentResult.data ?? []) as RoutineFollowUpRow[]
  if (!isMissingSchemaObject(currentResult.error, ['routine_follow_ups'])) throw normalizeError(currentResult.error, { operation: 'loadRoutineAssignments', status: currentResult.status })

  const legacyResult = await supabase
    .from('appointments')
    .select('id, routine_assignment_id, scheduled_at, status')
    .in('routine_assignment_id', assignmentIds)
  if (legacyResult.error) throw normalizeError(legacyResult.error, { operation: 'loadRoutineAssignments', status: legacyResult.status })
  return (legacyResult.data ?? []) as RoutineFollowUpRow[]
}

function routineExerciseName(entry: unknown) {
  if (typeof entry === 'string') return entry.trim() || null
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
  const record = entry as Record<string, unknown>
  for (const key of ['name', 'exerciseName', 'title']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export async function loadRoutines(providerId: string): Promise<Routine[]> {
  try {
    const { data: routines, error: routineError, status: routineErrorStatus } = await supabase
      .from('routines')
      .select('id, name, exercise_list')
      .eq('provider_id', providerId)
      .order('name')
    if (routineError) throw normalizeError(routineError, { operation: 'loadRoutines', status: routineErrorStatus })

    const rows = (routines ?? []) as RoutineRow[]
    return rows.map((routine) => ({
      id: routine.id,
      name: routine.name,
      exercises: (routine.exercise_list ?? []).map((entry, position) => {
        const record = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry as Record<string, unknown> : null
        const exerciseId = typeof record?.exercise_id === 'string' ? record.exercise_id : null
        const requiresReview = !exerciseId || Object.keys(record ?? {}).some((key) => !['exercise_id', 'name', 'sets', 'reps', 'duration_seconds', 'notes'].includes(key))
          || !['sets', 'reps', 'duration_seconds'].every((key) => validPrescriptionInteger(record?.[key]))
          || (record?.notes != null && typeof record.notes !== 'string')
        return { id: `${routine.id}-${position}`, name: routineExerciseName(entry) ?? `Unresolved exercise ${position + 1}`, position, exerciseId, requiresReview,
          sets: validPrescriptionInteger(record?.sets) ? record?.sets ?? null : null,
          reps: validPrescriptionInteger(record?.reps) ? record?.reps ?? null : null,
          durationSeconds: validPrescriptionInteger(record?.duration_seconds) ? record?.duration_seconds ?? null : null,
          notes: typeof record?.notes === 'string' ? record.notes : null }
      }),
    }))
  } catch (error) {
    throw normalizeError(error, { operation: 'loadRoutines' })
  }
}

export async function deleteRoutine(routineId: string) {
  try {
    const { error, status } = await supabase.rpc('delete_routine', { p_routine_id: routineId })
    if (error?.code === '23503') throw new AppError('CONFLICT', { message: 'This routine has patient assignments and cannot be deleted. Their history must be preserved.', cause: error, sourceCode: error.code, httpStatus: status })
    if (error) throw normalizeError(error, { operation: 'deleteRoutine', status })
  } catch (error) {
    throw normalizeError(error, { operation: 'deleteRoutine' })
  }
}

export async function saveRoutine(routineId: string | null, name: string, exercises: RoutineExerciseInput[]) {
  try {
    if (!name.trim() || name.length > 200) throw new AppError('VALIDATION_ERROR', { message: 'Routine name must contain 1 to 200 characters.', details: { fieldErrors: { name: 'INVALID' } } })
    if (!exercises.length || exercises.length > 100 || exercises.some((exercise) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(exercise.exerciseId))) {
      throw new AppError('VALIDATION_ERROR', { message: 'Select 1 to 100 valid catalog exercises.', details: { fieldErrors: { exercises: 'INVALID' } } })
    }
    if (exercises.some((exercise) => ![exercise.sets, exercise.reps, exercise.durationSeconds].every(validPrescriptionInteger)
      || (exercise.notes != null && typeof exercise.notes !== 'string'))) {
      throw new AppError('VALIDATION_ERROR', { message: 'Sets, reps, and duration must be positive whole numbers or blank; notes must be text.', details: { fieldErrors: { exercises: 'INVALID' } } })
    }
    const { data, error, status: errorStatus } = await supabase.rpc('save_routine_prescriptions', {
      p_routine_id: routineId,
      p_routine_name: name.trim(),
      p_exercises: exercises.map((exercise) => ({ exercise_id: exercise.exerciseId,
        sets: exercise.sets ?? null, reps: exercise.reps ?? null,
        duration_seconds: exercise.durationSeconds ?? null, notes: exercise.notes?.trim() || null })),
    })
    if (error?.code === 'PGRST202') throw new AppError('SERVICE_UNAVAILABLE', { message: 'Prescription saving is not available on this backend yet. Your changes have not been saved.', cause: error, sourceCode: error.code, httpStatus: errorStatus })
    if (error) throw normalizeError(error, { operation: 'saveRoutine', status: errorStatus })
    return data as string
  } catch (error) {
    throw normalizeError(error, { operation: 'saveRoutine' })
  }
}

export async function loadRoutineAssignments(profileIds: string[], startDate: string, endDate: string): Promise<RoutineAssignment[]> {
  try {
    if (!profileIds.length) return []
    const { data: assignments, error: assignmentError, status: assignmentErrorStatus } = await supabase
      .from('routine_assignments')
      .select('id, patient_profile_id, routine_id, scheduled_date, status, routine_name_snapshot')
      .in('patient_profile_id', profileIds)
      .gte('scheduled_date', startDate)
      .lte('scheduled_date', endDate)
      .neq('status', 'cancelled')
      .order('scheduled_date')
    if (assignmentError) throw normalizeError(assignmentError, { operation: 'loadRoutineAssignments', status: assignmentErrorStatus })

    const rows = (assignments ?? []) as RoutineAssignmentRow[]
    if (!rows.length) return []
    const assignmentIds = rows.map((assignment) => assignment.id)
    const [exercises, followUps] = await Promise.all([
      loadAssignmentExerciseSnapshots(assignmentIds),
      loadRoutineFollowUps(assignmentIds),
    ])

    const exercisesByAssignment = new Map<string, RoutineExercise[]>()
    for (const exercise of exercises) {
      const current = exercisesByAssignment.get(exercise.routine_assignment_id) ?? []
      current.push(toExercise(exercise))
      exercisesByAssignment.set(exercise.routine_assignment_id, current)
    }
    const followUpByAssignment = new Map<string, FollowUpAppointment>()
    for (const followUp of followUps) {
      followUpByAssignment.set(followUp.routine_assignment_id, {
        id: followUp.id,
        routineAssignmentId: followUp.routine_assignment_id,
        scheduledAt: followUp.scheduled_at,
        status: followUp.status,
      })
    }

    return rows.map((assignment) => ({
      id: assignment.id,
      patientProfileId: assignment.patient_profile_id,
      routineId: assignment.routine_id,
      scheduledDate: assignment.scheduled_date,
      status: assignment.status,
      routineName: assignment.routine_name_snapshot,
      exercises: exercisesByAssignment.get(assignment.id) ?? [],
      followUp: followUpByAssignment.get(assignment.id),
    }))
  } catch (error) {
    throw normalizeError(error, { operation: 'loadRoutineAssignments' })
  }
}

export async function assignRoutine(patientProfileId: string, routineId: string, scheduledDate: string) {
  try {
    const { data, error, status: errorStatus } = await supabase.rpc('assign_routine', {
      p_patient_profile_id: patientProfileId,
      p_routine_id: routineId,
      p_scheduled_date: scheduledDate,
    })
    if (error) throw normalizeError(error, { operation: 'assignRoutine', status: errorStatus })
    return data as string
  } catch (error) {
    throw normalizeError(error, { operation: 'assignRoutine' })
  }
}

export async function cancelRoutineAssignment(routineAssignmentId: string) {
  try {
    const { error, status: errorStatus } = await supabase.rpc('cancel_routine_assignment', { p_routine_assignment_id: routineAssignmentId })
    if (error) throw normalizeError(error, { operation: 'cancelRoutineAssignment', status: errorStatus })
  } catch (error) {
    throw normalizeError(error, { operation: 'cancelRoutineAssignment' })
  }
}

export async function scheduleRoutineFollowUp(routineAssignmentId: string, scheduledAt: string) {
  try {
    const { data, error, status: errorStatus } = await supabase.rpc('schedule_routine_follow_up', {
      p_routine_assignment_id: routineAssignmentId,
      p_scheduled_at: scheduledAt,
    })
    if (error) throw normalizeError(error, { operation: 'scheduleRoutineFollowUp', status: errorStatus })
    return data as string
  } catch (error) {
    throw normalizeError(error, { operation: 'scheduleRoutineFollowUp' })
  }
}

export async function cancelRoutineFollowUp(routineAssignmentId: string) {
  try {
    const { error, status: errorStatus } = await supabase.rpc('cancel_routine_follow_up', { p_routine_assignment_id: routineAssignmentId })
    if (error) throw normalizeError(error, { operation: 'cancelRoutineFollowUp', status: errorStatus })
  } catch (error) {
    throw normalizeError(error, { operation: 'cancelRoutineFollowUp' })
  }
}

export async function completeRoutineFollowUp(routineAssignmentId: string) {
  try {
    const { error, status: errorStatus } = await supabase.rpc('complete_routine_follow_up', { p_routine_assignment_id: routineAssignmentId })
    if (error) throw normalizeError(error, { operation: 'completeRoutineFollowUp', status: errorStatus })
  } catch (error) {
    throw normalizeError(error, { operation: 'completeRoutineFollowUp' })
  }
}
