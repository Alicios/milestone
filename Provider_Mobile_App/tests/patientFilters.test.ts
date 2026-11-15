import test from 'node:test';
import assert from 'node:assert/strict';
import { filterPatients, type AssignmentSummary } from '../src/lib/patientFilters';
import type { Patient } from '../src/types';

const patients = [
  { id: 'shared-patient', profileId: 'relationship-a', name: 'Alex', dischargedAt: null },
  { id: 'shared-patient', profileId: 'relationship-b', name: 'Blair', dischargedAt: null },
  { id: 'patient-c', profileId: 'relationship-c', name: 'Casey', dischargedAt: null },
  { id: 'patient-d', profileId: 'relationship-d', name: 'Drew', dischargedAt: '2026-11-01' },
] as Patient[];
const summaries: AssignmentSummary[] = [
  { id: 'a1', patientProfileId: 'relationship-a', scheduledDate: '2026-11-09', status: 'completed' },
  { id: 'b1', patientProfileId: 'relationship-b', scheduledDate: '2026-11-10', status: 'scheduled', patientResult: { inProgress: true, comment: null, source: 'patient' } },
  { id: 'c1', patientProfileId: 'relationship-c', scheduledDate: '2026-11-10', status: 'cancelled' },
];
const options = { query: '', archive: false, filter: 'all' as const, sort: 'nameAsc' as const, today: '2026-11-10' };
test('routine filters scope by care relationship, even for the same patient identity', () => {
  assert.deepEqual(filterPatients(patients, summaries, { ...options, filter: 'completed' }).map(p => p.profileId), ['relationship-a']);
  assert.deepEqual(filterPatients(patients, summaries, { ...options, filter: 'inProgress' }).map(p => p.profileId), ['relationship-b']);
});
test('cancelled assignments do not prevent unassigned matches', () => {
  assert.deepEqual(filterPatients(patients, summaries, { ...options, filter: 'unassigned' }).map(p => p.name), ['Casey']);
});
test('search, sort, and archive membership compose with status filters', () => {
  assert.deepEqual(filterPatients(patients, summaries, { ...options, query: '  BLA ', sort: 'nameDesc' }).map(p => p.name), ['Blair']);
  assert.deepEqual(filterPatients(patients, summaries, { ...options, sort: 'nameDesc' }).map(p => p.name), ['Casey', 'Blair', 'Alex']);
  assert.deepEqual(filterPatients(patients, summaries, { ...options, archive: true, filter: 'completed' }).map(p => p.name), ['Drew']);
});
test('care date sorts in both directions, with undated patients last and names breaking ties', () => {
  const dated = patients.map(patient => ({ ...patient, startOfCare: ({ Alex: '2026-09-01', Blair: '2026-10-01', Casey: '2026-10-01' } as Record<string, string>)[patient.name] ?? null })) as Patient[];
  assert.deepEqual(filterPatients(dated, summaries, { ...options, sort: 'careNewest' }).map(p => p.name), ['Blair', 'Casey', 'Alex']);
  assert.deepEqual(filterPatients(dated, summaries, { ...options, sort: 'careOldest' }).map(p => p.name), ['Alex', 'Blair', 'Casey']);
  assert.deepEqual(filterPatients(dated, summaries, { ...options, archive: true, sort: 'careNewest' }).map(p => p.name), ['Drew']);
});
test('missed/critical status filters use the same issue precedence as the patient page', () => {
  const old: AssignmentSummary[] = [{ id: 'a2', patientProfileId: 'relationship-a', scheduledDate: '2026-11-09', status: 'scheduled', patientResult: { inProgress: true, issue: 'critical', comment: null, source: 'patient' } }];
  assert.deepEqual(filterPatients(patients, old, { ...options, filter: 'critical' }).map(p => p.name), ['Alex']);
  assert.deepEqual(filterPatients(patients, old, { ...options, filter: 'missed' }), []);
});
