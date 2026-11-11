import type { Assignment } from '../types';

export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function weekDates(offset = 0, now = new Date()): string[] {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday); day.setDate(day.getDate() + i); return localDateKey(day);
  });
}
export function formatDate(date: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
}
export type RoutineStatus = 'neutral' | 'completed' | 'inProgress' | 'issue' | 'missed' | 'critical';
export function resolveRoutineStatus(assignment: Pick<Assignment, 'status' | 'scheduledDate' | 'patientResult'>, today?: string): { status: RoutineStatus; label: string } | null {
  const signals: Partial<NonNullable<Assignment['patientResult']>> = assignment.patientResult ?? {};
  if (assignment.status === 'cancelled') return null;
  if (signals.issue === 'critical') return { status: 'critical', label: 'Critical issue reported' };
  if (assignment.status === 'missed' || (today && assignment.scheduledDate < today && assignment.status !== 'completed')) {
    return { status: 'missed', label: signals.issue ? 'Missed routine · Patient reported an issue' : 'Missed routine' };
  }
  if (signals.issue) return { status: 'issue', label: 'Patient reported an issue' };
  if (assignment.status === 'completed') return { status: 'completed', label: 'Completed' };
  if (signals.inProgress) return { status: 'inProgress', label: 'In progress / partially complete' };
  return { status: 'neutral', label: assignment.status === 'modified' ? 'Modified' : 'Assigned, not started' };
}
export function validateMessage(body: string) {
  const trimmed = body.trim();
  if (!trimmed || [...trimmed].length > 4000) throw new Error('Enter a message between 1 and 4,000 characters.');
  return trimmed;
}
export function friendlyError(error: unknown): string {
  if (error instanceof Error && /^(Enter a message|Device authentication|Session storage|Your session|This account|Authentication|Please enter|Sign-out)/.test(error.message)) return error.message;
  const code = (error as { code?: string })?.code;
  if (code === 'invalid_credentials') return 'The email or password is incorrect.';
  if (code === 'mfa_verification_failed') return 'That authentication code was not accepted. Try a new code.';
  if (code === 'over_request_rate_limit') return 'Too many attempts. Please wait a moment and try again.';
  return 'We could not complete this request. Check your connection and try again.';
}
