export interface User {
  id: string
  name: string
  email: string
  professionalTitle: string
  initials: string
  avatarUrl: string
  phone: string
  bio: string
  medicalPracticeId: string
  medicalPracticeName: string
  facility: string
  officeLocation: string
  workPhone: string
  workPhoneExtension: string
  preferredContact: PreferredContact
}

export type PreferredContact = 'email' | 'phone' | 'in-app'

export type EditableUserFields = Omit<User, 'id' | 'initials'>

export type ProfileFields = Pick<User, 'name' | 'professionalTitle' | 'email' | 'phone' | 'bio' | 'avatarUrl' | 'medicalPracticeId' | 'facility' | 'officeLocation' | 'workPhone' | 'workPhoneExtension' | 'preferredContact'>

export interface MedicalPractice {
  id: string
  name: string
  description: string
}

export interface DashboardMetric {
  label: string
  value: string
  detail: string
  icon: 'patients' | 'appointments' | 'messages' | 'tasks'
  tone: 'blue' | 'green' | 'orange' | 'purple'
}

export interface ActivityItem {
  id: string
  title: string
  description: string
  time: string
  type: 'appointment' | 'message' | 'record'
}

export interface CatalogExercise {
  id: string
  name: string
  description: string
  media?: CatalogExerciseMedia[]
}

export interface CatalogExerciseMedia {
  kind: 'image' | 'video-link' | 'image-link'
  url: string
  source: string
  title: string
  sourceUrl?: string
  accessNote?: string
  preview?: { kind: 'embed' | 'video'; url: string; source?: string; sourceUrl?: string; poster?: string }
}

export interface ExercisePrescription {
  sets?: number | null
  reps?: number | null
  durationSeconds?: number | null
  notes?: string | null
}

export interface RoutineExerciseInput extends ExercisePrescription {
  exerciseId: string
}

export interface RoutineExercise extends ExercisePrescription {
  exerciseId?: string | null
  requiresReview?: boolean
  id: string
  name: string
  position: number
  patientFeedback?: ExercisePatientFeedback
}

export interface ExercisePatientFeedback {
  painScore: number
  feeling: 'good' | 'neutral' | 'difficult'
  explanation: string | null
  reportedAt: string
}

export interface Routine {
  id: string
  name: string
  description?: string
  editorDocument?: import('./lib/routinePrototype').DemoRoutine | null
  exercises: RoutineExercise[]
}

export interface RoutineChangeImpact {
  routineId: string
  name: string
  token: string
  assignmentCount: number
  preservedCount: number
  patients: { id: string; name: string; assignmentCount: number; dates: string[] }[]
}

export type RoutineAssignmentStatus = 'scheduled' | 'completed' | 'missed' | 'modified' | 'cancelled'
export type FollowUpStatus = 'scheduled' | 'completed' | 'cancelled'

export interface FollowUpAppointment {
  id: string
  routineAssignmentId: string
  scheduledAt: string
  status: FollowUpStatus
}

export interface RoutineAssignment {
  id: string
  patientProfileId: string
  routineId: string
  scheduledDate: string
  status: RoutineAssignmentStatus
  routineName: string
  exercises: RoutineExercise[]
  followUp?: FollowUpAppointment
  patientResult?: RoutinePatientResult
  exerciseFeedbackError?: string
}

export interface RoutinePatientResult {
  inProgress: boolean
  issue?: 'noncritical' | 'critical'
  comment: string | null
  source: 'patient' | 'demo' | null
}
