export interface User {
  id: string
  name: string
  email: string
  role: string
  initials: string
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
