import type { RoutineAssignment } from '../types'

export type RoutineVisualStatus = 'neutral' | 'completed' | 'inProgress' | 'issue' | 'missed' | 'critical'
// Signals are independent of workflow status. Explicit inputs support previews;
// live assignments use their stored patient result by default.
export interface RoutineProgressSignals {
  inProgress?: boolean
  issue?: 'noncritical' | 'critical'
}
export interface RoutineStatusPresentation { status: RoutineVisualStatus; label: string }

export const routineStatusLabels: Record<RoutineVisualStatus, string> = {
  neutral: 'Assigned, not started', completed: 'Completed', inProgress: 'In progress / partially complete',
  issue: 'Patient reported an issue', missed: 'Missed routine', critical: 'Critical issue reported',
}
export const routineStatusOrder: RoutineVisualStatus[] = ['neutral', 'completed', 'inProgress', 'issue', 'missed', 'critical']

export function resolveRoutineStatus(
  assignment: Pick<RoutineAssignment, 'status' | 'scheduledDate' | 'patientResult'>,
  today?: string,
  signals: RoutineProgressSignals = assignment.patientResult ?? {},
): RoutineStatusPresentation | null {
  if (assignment.status === 'cancelled') return null
  if (signals.issue === 'critical') return { status: 'critical', label: routineStatusLabels.critical }
  if (assignment.status === 'missed' || (today && assignment.scheduledDate < today && assignment.status !== 'completed')) {
    return { status: 'missed', label: signals.issue ? 'Missed routine · Patient reported an issue' : routineStatusLabels.missed }
  }
  if (signals.issue) return { status: 'issue', label: routineStatusLabels.issue }
  if (assignment.status === 'completed') return { status: 'completed', label: routineStatusLabels.completed }
  if (signals.inProgress) return { status: 'inProgress', label: routineStatusLabels.inProgress }
  return { status: 'neutral', label: assignment.status === 'modified' ? 'Modified' : routineStatusLabels.neutral }
}

// Explicit pairs keep missed light red and critical a stronger red in either theme.
const light = {
  neutral: { background: '#eceff1', foreground: '#263238', border: '#687780', hover: '#dce2e5' },
  completed: { background: '#d4eddd', foreground: '#174c30', border: '#358258', hover: '#c0e3cd' },
  inProgress: { background: '#d8eaff', foreground: '#163e70', border: '#3b73ac', hover: '#c0dcfa' },
  issue: { background: '#fff1b8', foreground: '#594400', border: '#917000', hover: '#ffe898' },
  missed: { background: '#fbe0e0', foreground: '#792d32', border: '#b46a70', hover: '#f5cdcf' },
  critical: { background: '#b42332', foreground: '#ffffff', border: '#811626', hover: '#941c29' },
}
const dark: typeof light = {
  neutral: { background: '#34454e', foreground: '#f0f3f5', border: '#9aabb4', hover: '#405660' },
  completed: { background: '#204b36', foreground: '#dcf8e7', border: '#75c8a2', hover: '#2a6045' },
  inProgress: { background: '#203f62', foreground: '#e0efff', border: '#82b8f0', hover: '#2a507b' },
  issue: { background: '#584b1e', foreground: '#fff2b8', border: '#e3c65d', hover: '#6d5d25' },
  missed: { background: '#efb9bd', foreground: '#592028', border: '#f5d3d5', hover: '#f6cbce' },
  critical: { background: '#ac2236', foreground: '#ffffff', border: '#ff8e9c', hover: '#c02b40' },
}
export function routineStatusPalette(status: RoutineVisualStatus, mode: 'light' | 'dark') {
  return (mode === 'dark' ? dark : light)[status]
}
