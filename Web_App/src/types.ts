export interface User {
  id: string
  name: string
  email: string
  professionalTitle: string
  initials: string
  avatarUrl: string
  phone: string
  specialty: string
  bio: string
  department: string
  facility: string
  officeLocation: string
  workPhone: string
  workPhoneExtension: string
  preferredContact: PreferredContact
}

export type PreferredContact = 'email' | 'phone' | 'in-app'

export type EditableUserFields = Omit<User, 'id' | 'initials'>

export type ProfileFields = Pick<User, 'name' | 'professionalTitle' | 'email' | 'phone' | 'specialty' | 'bio' | 'avatarUrl' | 'department' | 'facility' | 'officeLocation' | 'workPhone' | 'workPhoneExtension' | 'preferredContact'>

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

export interface RoutineExercise {
  id: string
  name: string
  position: number
}

export interface Routine {
  id: string
  name: string
  exercises: RoutineExercise[]
  archivedAt?: string
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
}
