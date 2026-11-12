import type { Assignment, Exercise, Patient } from '../types';
import type { createProviderApi } from './api';

export function homeDateRange(today: string) {
  const start = new Date(`${today}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 6);
  return { from: start.toISOString().slice(0, 10), to: today };
}
export type Activity = { patient: Patient; assignment: Assignment };
export type CareIssue = Activity & { exercise?: Exercise; critical: boolean };
export function homeActivity(patients: Patient[], assignments: Assignment[]) {
  const active = new Map(patients.filter(patient => !patient.dischargedAt).map(patient => [patient.profileId, patient]));
  const activity: Activity[] = assignments.flatMap(assignment => {
    const patient = active.get(assignment.patientProfileId);
    return patient && assignment.status !== 'cancelled' ? [{ patient, assignment }] : [];
  }).sort((a, b) => b.assignment.scheduledDate.localeCompare(a.assignment.scheduledDate) || a.assignment.id.localeCompare(b.assignment.id));
  const issues: CareIssue[] = activity.flatMap(row => {
    const critical = row.assignment.patientResult?.issue === 'critical';
    const exercises = row.assignment.exercises.filter(exercise => exercise.patientFeedback &&
      (exercise.patientFeedback.feeling === 'difficult' || exercise.patientFeedback.painScore >= 7));
    return exercises.length ? exercises.map(exercise => ({ ...row, exercise, critical }))
      : row.assignment.patientResult?.issue ? [{ ...row, critical }] : [];
  }).sort((a, b) => Number(b.critical) - Number(a.critical) || b.assignment.scheduledDate.localeCompare(a.assignment.scheduledDate));
  return { patients: active.size, completed: activity.filter(row => row.assignment.status === 'completed'), issues,
    feedbackUnavailable: activity.some(row => row.assignment.exerciseFeedbackError) };
}
export async function loadHomeActivity(api: Pick<ReturnType<typeof createProviderApi>, 'patients' | 'assignments'>, providerId: string, today: string) {
  const patients = await api.patients(providerId);
  const ids = patients.filter(patient => !patient.dischargedAt).map(patient => patient.profileId);
  const assignments: Assignment[] = [];
  const { from, to } = homeDateRange(today);
  for (let i = 0; i < ids.length; i += 50) assignments.push(...await api.assignments(ids.slice(i, i + 50), from, to));
  return homeActivity(patients, assignments);
}
