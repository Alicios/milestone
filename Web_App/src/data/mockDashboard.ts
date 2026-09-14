import type { ActivityItem, DashboardMetric } from '../types'

export const dashboardMetrics: DashboardMetric[] = [
  { label: 'Active patients', value: '248', detail: '+12 this month', icon: 'patients', tone: 'blue' },
  { label: "Today's appointments", value: '14', detail: '3 remaining', icon: 'appointments', tone: 'green' },
  { label: 'Unread messages', value: '08', detail: '2 need attention', icon: 'messages', tone: 'orange' },
  { label: 'Open tasks', value: '06', detail: 'Due this week', icon: 'tasks', tone: 'purple' },
]

export const recentActivity: ActivityItem[] = [
  { id: '1', title: 'Appointment completed', description: 'Patient account •••• 1842', time: '10 min ago', type: 'appointment' },
  { id: '2', title: 'New patient message', description: 'Patient account •••• 7391', time: '32 min ago', type: 'message' },
  { id: '3', title: 'Record updated', description: 'Patient account •••• 4420', time: '1 hr ago', type: 'record' },
]
