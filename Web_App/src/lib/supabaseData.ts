import { supabase } from './supabase'
import type { AssignmentExerciseSnapshot, EditableUserFields, Exercise, FollowUpAppointment, Routine, RoutineAssignment, RoutineAssignmentStatus, RoutineExercise, User } from '../types'
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
  specialty: string
  bio: string
  department: string
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
    specialty: provider.specialty,
    bio: provider.bio,
    department: provider.department,
    facility: provider.facility,
    officeLocation: provider.office_location,
    workPhone: provider.work_phone,
    workPhoneExtension: provider.work_phone_extension,
    preferredContact: provider.preferred_contact,
  }
}

export async function loadProvider(userId: string, authEmail = '') {
  const { data, error } = await supabase.from('providers').select('*').eq('id', userId).single()
  if (error) throw error
  return toUser(data as ProviderRow, authEmail)
}

export async function updateProvider(userId: string, profile: EditableUserFields) {
  const sharedUpdate = {
    name: profile.name,
    contact_email: profile.email,
    phone: profile.phone,
    specialty: profile.specialty,
    bio: profile.bio,
    avatar_url: profile.avatarUrl,
    department: profile.department,
    facility: profile.facility,
    office_location: profile.officeLocation,
    work_phone: profile.workPhone,
    work_phone_extension: profile.workPhoneExtension,
    preferred_contact: profile.preferredContact,
  }
  const currentResult = await supabase.from('providers').update({
    ...sharedUpdate,
    professional_title: profile.professionalTitle,
  }).eq('id', userId).select('*').single()
  if (!currentResult.error) return currentResult.data as ProviderRow
  if (!isMissingSchemaObject(currentResult.error, ['professional_title'])) throw currentResult.error

  const legacyResult = await supabase.from('providers').update({
    ...sharedUpdate,
    role: profile.professionalTitle,
  }).eq('id', userId).select('*').single()
  if (legacyResult.error) throw legacyResult.error
  return legacyResult.data as ProviderRow
}

export async function uploadProviderAvatar(userId: string, file: File) {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw new Error(`Unable to verify the signed-in user: ${authError.message}`)
  if (!authData.user) throw new Error('No authenticated Supabase user is available for the upload.')
  if (authData.user.id !== userId) {
    throw new Error(`Provider profile ID does not match the signed-in user (profile=${userId}, auth=${authData.user.id}).`)
  }
  const path = `${authData.user.id}/avatar`
  const { error } = await supabase.storage.from(PROFILE_IMAGE_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: true,
  })
  if (error) {
    const details = error as { message?: string; statusCode?: string | number; error?: string }
    throw new Error(`${details.message ?? 'Storage upload was rejected.'} (bucket=${PROFILE_IMAGE_BUCKET}, path=${path}, status=${details.statusCode ?? 'unknown'}, code=${details.error ?? 'unknown'})`)
  }
  return supabase.storage.from(PROFILE_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
}

type PatientProfileRow = { id: string; patient_id: string }
type PatientRow = { id: string; name: string; email?: string | null; phone?: string | null; primary_concern?: string | null; treatment_focus?: string | null; start_of_care?: string | null; care_status?: Patient['careStatus'] | null }
type StatusRow = { patient_profile_id: string; day_index: number; status: Patient['statuses'][number] }

export async function loadPatients(providerId: string): Promise<Patient[]> {
  const { data: profiles, error: profileError } = await supabase
    .from('provider_patient_profiles')
    .select('id, patient_id')
    .eq('provider_id', providerId)
    .is('discharged_at', null)
  if (profileError) throw profileError

  const profileRows = (profiles ?? []) as PatientProfileRow[]
  if (!profileRows.length) return []
  const patientIds = profileRows.map((profile) => profile.patient_id)
  const profileIds = profileRows.map((profile) => profile.id)

  const extendedPatientQuery = await supabase.from('patients').select('id, name, email, phone, primary_concern, treatment_focus, start_of_care, care_status').in('id', patientIds)
  const patientQuery = extendedPatientQuery.error?.code === '42703'
    ? await supabase.from('patients').select('id, name').in('id', patientIds)
    : extendedPatientQuery
  const [{ data: patients, error: patientError }, { data: statuses, error: statusError }] = [patientQuery, await supabase.from('patient_statuses').select('patient_profile_id, day_index, status').in('patient_profile_id', profileIds)]
  if (patientError) throw patientError
  if (statusError) throw statusError

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
      statuses: patientStatuses,
    }
  })
}

export async function createPatient(name: string, phone: string) {
  const { data, error } = await supabase.rpc('create_patient', { patient_name: name.trim(), patient_phone: phone.trim() })
  if (error?.code === 'PGRST202' || error?.code === '42883') {
    const legacyResult = await supabase.rpc('create_patient', { patient_name: name.trim() })
    if (legacyResult.error) throw legacyResult.error
    return legacyResult.data as string
  }
  if (error) throw error
  return data as string
}

export async function dischargePatient(patientId: string) {
  const { error } = await supabase.rpc('discharge_patient', { patient_id: patientId })
  if (error) throw error
}

type ExerciseRow = { id: string; name: string; instructions: string; created_at: string; updated_at: string }

function toExercise(row: ExerciseRow): Exercise {
  return { id: row.id, name: row.name, instructions: row.instructions, createdAt: row.created_at, updatedAt: row.updated_at }
}

export async function loadExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase.from('exercises').select('id, name, instructions, created_at, updated_at').order('name').order('id')
  if (error) throw error
  return ((data ?? []) as ExerciseRow[]).map(toExercise)
}

export async function saveExercise(exerciseId: string | null, name: string, instructions: string): Promise<Exercise> {
  const { data: id, error: saveError } = await supabase.rpc('save_exercise', {
    p_exercise_id: exerciseId,
    p_name: name.trim(),
    p_instructions: instructions.trim(),
  })
  if (saveError) throw saveError
  const { data, error } = await supabase.from('exercises').select('id, name, instructions, created_at, updated_at').eq('id', id).single()
  if (error) throw error
  return toExercise(data as ExerciseRow)
}

type RoutineRow = { id: string; name: string; archived_at: string | null }
type RoutineExerciseRow = { id: string; routine_id: string; exercise_id: string; position: number; exercise: { name: string; instructions: string } | null }
type RoutineAssignmentRow = {
  id: string
  patient_profile_id: string
  routine_id: string
  scheduled_date: string
  status: RoutineAssignmentStatus
  routine_name_snapshot: string
}
type AssignmentExerciseRow = { id: string; routine_assignment_id: string; exercise_name_snapshot: string; instructions?: string; position: number }
type LegacyAssignmentExerciseRow = { id: string; routine_assignment_id: string; name: string; instructions?: string; position: number }
type RoutineFollowUpRow = { id: string; routine_assignment_id: string; scheduled_at: string; status: FollowUpAppointment['status'] }

async function loadAssignmentExerciseSnapshots(assignmentIds: string[]) {
  async function loadRows(nameColumn: 'exercise_name_snapshot' | 'name') {
    const columns = `id, routine_assignment_id, ${nameColumn}, position`
    const withInstructions = await supabase
      .from('routine_assignment_exercises')
      .select(`${columns}, instructions`)
      .in('routine_assignment_id', assignmentIds)
      .order('position')
    // Before SCRUM-43, snapshots have no recorded instructions. Never load
    // historical information from the mutable exercise catalog as a fallback.
    if (!isMissingSchemaObject(withInstructions.error, ['instructions'])) return withInstructions
    return supabase.from('routine_assignment_exercises').select(columns)
      .in('routine_assignment_id', assignmentIds).order('position')
  }

  const currentResult = await loadRows('exercise_name_snapshot')
  if (!currentResult.error) return (currentResult.data ?? []) as unknown as AssignmentExerciseRow[]
  if (!isMissingSchemaObject(currentResult.error, ['exercise_name_snapshot'])) throw currentResult.error

  const legacyResult = await loadRows('name')
  if (legacyResult.error) throw legacyResult.error
  return ((legacyResult.data ?? []) as unknown as LegacyAssignmentExerciseRow[]).map((exercise) => ({
    id: exercise.id,
    routine_assignment_id: exercise.routine_assignment_id,
    exercise_name_snapshot: exercise.name,
    instructions: exercise.instructions,
    position: exercise.position,
  }))
}

async function loadRoutineFollowUps(assignmentIds: string[]) {
  const currentResult = await supabase
    .from('routine_follow_ups')
    .select('id, routine_assignment_id, scheduled_at, status')
    .in('routine_assignment_id', assignmentIds)
  if (!currentResult.error) return (currentResult.data ?? []) as RoutineFollowUpRow[]
  if (!isMissingSchemaObject(currentResult.error, ['routine_follow_ups'])) throw currentResult.error

  const legacyResult = await supabase
    .from('appointments')
    .select('id, routine_assignment_id, scheduled_at, status')
    .in('routine_assignment_id', assignmentIds)
  if (legacyResult.error) throw legacyResult.error
  return (legacyResult.data ?? []) as RoutineFollowUpRow[]
}

export async function loadRoutines(includeArchived = false): Promise<Routine[]> {
  let routineQuery = supabase.from('routines').select('id, name, archived_at').order('name')
  if (!includeArchived) routineQuery = routineQuery.is('archived_at', null)
  const { data: routines, error: routineError } = await routineQuery
  if (routineError) throw routineError

  const rows = (routines ?? []) as RoutineRow[]
  if (!rows.length) return []
  const { data: exercises, error: exerciseError } = await supabase
    .from('routine_exercises')
    .select('id, routine_id, exercise_id, position, exercise:exercises!routine_exercises_exercise_id_fkey(name, instructions)')
    .in('routine_id', rows.map((routine) => routine.id))
    .order('position')
  if (exerciseError) throw exerciseError

  const byRoutine = new Map<string, RoutineExercise[]>()
  for (const exercise of (exercises ?? []) as unknown as RoutineExerciseRow[]) {
    if (!exercise.exercise) {
      throw new Error('Routine data is inconsistent: a referenced exercise definition is missing or inaccessible. Reload or contact your administrator.')
    }
    const current = byRoutine.get(exercise.routine_id) ?? []
    current.push({ id: exercise.id, exerciseId: exercise.exercise_id, name: exercise.exercise.name, instructions: exercise.exercise.instructions, position: exercise.position })
    byRoutine.set(exercise.routine_id, current)
  }
  return rows.map((routine) => ({
    id: routine.id,
    name: routine.name,
    exercises: byRoutine.get(routine.id) ?? [],
    archivedAt: routine.archived_at ?? undefined,
  }))
}

export async function saveRoutine(routineId: string | null, name: string, exerciseIds: string[]) {
  const { data, error } = await supabase.rpc('save_routine_with_exercises', {
    p_routine_id: routineId,
    p_routine_name: name.trim(),
    p_exercise_ids: exerciseIds,
  })
  if (error) throw error
  return data as string
}

export async function archiveRoutine(routineId: string) {
  const { error } = await supabase.rpc('archive_routine', { p_routine_id: routineId })
  if (error) throw error
}

export async function loadRoutineAssignments(profileIds: string[], startDate: string, endDate: string): Promise<RoutineAssignment[]> {
  if (!profileIds.length) return []
  const { data: assignments, error: assignmentError } = await supabase
    .from('routine_assignments')
    .select('id, patient_profile_id, routine_id, scheduled_date, status, routine_name_snapshot')
    .in('patient_profile_id', profileIds)
    .gte('scheduled_date', startDate)
    .lte('scheduled_date', endDate)
    .neq('status', 'cancelled')
    .order('scheduled_date')
  if (assignmentError) throw assignmentError

  const rows = (assignments ?? []) as RoutineAssignmentRow[]
  if (!rows.length) return []
  const assignmentIds = rows.map((assignment) => assignment.id)
  const [exercises, followUps] = await Promise.all([
    loadAssignmentExerciseSnapshots(assignmentIds),
    loadRoutineFollowUps(assignmentIds),
  ])

  const exercisesByAssignment = new Map<string, AssignmentExerciseSnapshot[]>()
  for (const exercise of exercises) {
    const current = exercisesByAssignment.get(exercise.routine_assignment_id) ?? []
    current.push({ id: exercise.id, name: exercise.exercise_name_snapshot, instructions: exercise.instructions ?? '', position: exercise.position })
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
}

export async function assignRoutine(patientProfileId: string, routineId: string, scheduledDate: string) {
  const { data, error } = await supabase.rpc('assign_routine', {
    p_patient_profile_id: patientProfileId,
    p_routine_id: routineId,
    p_scheduled_date: scheduledDate,
  })
  if (error) throw error
  return data as string
}

export async function cancelRoutineAssignment(routineAssignmentId: string) {
  const { error } = await supabase.rpc('cancel_routine_assignment', { p_routine_assignment_id: routineAssignmentId })
  if (error) throw error
}

export async function scheduleRoutineFollowUp(routineAssignmentId: string, scheduledAt: string) {
  const { data, error } = await supabase.rpc('schedule_routine_follow_up', {
    p_routine_assignment_id: routineAssignmentId,
    p_scheduled_at: scheduledAt,
  })
  if (error) throw error
  return data as string
}

export async function cancelRoutineFollowUp(routineAssignmentId: string) {
  const { error } = await supabase.rpc('cancel_routine_follow_up', { p_routine_assignment_id: routineAssignmentId })
  if (error) throw error
}

export async function completeRoutineFollowUp(routineAssignmentId: string) {
  const { error } = await supabase.rpc('complete_routine_follow_up', { p_routine_assignment_id: routineAssignmentId })
  if (error) throw error
}
