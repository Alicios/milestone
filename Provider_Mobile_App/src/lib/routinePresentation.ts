import type { Assignment } from '../types';
import { resolveRoutineStatus, type RoutineStatus } from './domain';

export function routinePresentation(assignment: Pick<Assignment, 'status' | 'scheduledDate' | 'patientResult'>, today?: string) {
  const base = resolveRoutineStatus(assignment, today);
  if (!base) return null;
  const completed = assignment.status === 'completed';
  const issue = assignment.patientResult?.issue;
  const label = completed && issue === 'critical' ? 'Completed · Critical issue' : completed && issue ? 'Completed with issues' : base.label;
  return { ...base, label, completed, issue };
}
const light: Record<RoutineStatus, [string, string]> = { neutral: ['#ECEFF1', '#263238'], completed: ['#D4EDDD', '#174C30'], inProgress: ['#D8EAFF', '#163E70'], issue: ['#FFF1B8', '#594400'], missed: ['#FBE0E0', '#792D32'], critical: ['#B42332', '#FFFFFF'] };
const dark: Record<RoutineStatus, [string, string]> = { neutral: ['#34454E', '#F0F3F5'], completed: ['#204B36', '#DCF8E7'], inProgress: ['#203F62', '#E0EFFF'], issue: ['#584B1E', '#FFF2B8'], missed: ['#EFB9BD', '#592028'], critical: ['#AC2236', '#FFFFFF'] };
export function routineColors(status: RoutineStatus, mode: 'light' | 'dark') { return (mode === 'dark' ? dark : light)[status]; }
