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
}

export type ProfileFields = Omit<User, 'id' | 'initials'>

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
