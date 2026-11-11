import type { Assignment, Patient } from '../types';
import { resolveRoutineStatus, type RoutineStatus } from './domain';

export type AssignmentSummary = Pick<Assignment, 'id' | 'patientProfileId' | 'scheduledDate' | 'status' | 'patientResult'>;
export type PatientFilter = 'all' | RoutineStatus | 'modified' | 'unassigned';
export const patientFilters: { value: PatientFilter; label: string }[] = [
  { value: 'all', label: 'All current patients' },
  { value: 'neutral', label: 'Assigned, not started' },
  { value: 'completed', label: 'Completed' },
  { value: 'inProgress', label: 'In progress / partially complete' },
  { value: 'issue', label: 'Patient reported an issue' },
  { value: 'missed', label: 'Missed routine' },
  { value: 'critical', label: 'Critical issue reported' },
  { value: 'modified', label: 'Modified' },
  { value: 'unassigned', label: 'Unassigned this week' },
];
export function filterPatients(patients: Patient[], summaries: AssignmentSummary[], options: { query: string; archive: boolean; filter: PatientFilter; descending: boolean; today: string }): Patient[] {
  const query = options.query.trim().toLowerCase();
  const byProfile = new Map<string, AssignmentSummary[]>();
  for (const assignment of summaries) {
    if (assignment.status === 'cancelled') continue;
    const list = byProfile.get(assignment.patientProfileId) ?? [];
    list.push(assignment); byProfile.set(assignment.patientProfileId, list);
  }
  return patients.filter(patient => Boolean(patient.dischargedAt) === options.archive && patient.name.toLowerCase().includes(query))
    .filter(patient => {
      if (options.archive || options.filter === 'all') return true;
      const assigned = byProfile.get(patient.profileId) ?? [];
      if (options.filter === 'unassigned') return assigned.length === 0;
      return assigned.some(assignment => options.filter === 'modified' ? assignment.status === 'modified' : resolveRoutineStatus(assignment, options.today)?.status === options.filter);
    }).sort((a, b) => (options.descending ? -1 : 1) * a.name.localeCompare(b.name));
}
