export interface User {
  id: string
  name: string
  email: string
  role: string
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

export type ProfileFields = Pick<User, 'name' | 'role' | 'email' | 'phone' | 'specialty' | 'bio' | 'avatarUrl'>

export type SettingsFields = Pick<User, 'name' | 'role' | 'department' | 'facility' | 'officeLocation' | 'email' | 'phone' | 'workPhone' | 'workPhoneExtension' | 'preferredContact'>

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
