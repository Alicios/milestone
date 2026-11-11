import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { localDateKey, resolveRoutineStatus, validateMessage, weekDates, formatDate } from '../src/lib/domain';
import type { Assignment } from '../src/types';

test('status agrees with provider web across workflow states, issues, dates and progress', async () => {
  const sibling = new URL('../../Web_App/src/lib/routineStatus.ts', import.meta.url);
  const staged = new URL('../../src/lib/routineStatus.ts', import.meta.url);
  const web = await import(pathToFileURL(fileURLToPath(existsSync(sibling) ? sibling : staged)).href);
  for (const status of ['scheduled', 'completed', 'missed', 'modified', 'cancelled'] as const) {
    for (const issue of [undefined, 'critical', 'noncritical'] as const) {
      for (const inProgress of [true, false]) {
        for (const scheduledDate of ['2026-11-08', '2026-11-09', '2026-11-10']) {
          const assignment = { status, scheduledDate, patientResult: { issue, inProgress, source: 'patient' as const, comment: null } };
          assert.deepEqual(resolveRoutineStatus(assignment, '2026-11-09'), web.resolveRoutineStatus(assignment, '2026-11-09'));
        }
      }
    }
  }
});
test('weeks start Monday and cross month/year boundaries without UTC date shifts', () => {
  assert.deepEqual(weekDates(0, new Date(2027, 0, 3, 23, 59)), ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  assert.equal(weekDates(1, new Date(2026, 10, 9))[0], '2026-11-16');
  assert.equal(localDateKey(new Date(2026, 10, 9, 0, 1)), '2026-11-09');
  assert.equal(formatDate('2026-11-09'), 'Nov 9');
});
test('message limits count Unicode characters, trim whitespace, and reject blank or oversized sends', () => {
  assert.equal(validateMessage('  Hello  '), 'Hello');
  assert.equal([...validateMessage('😀'.repeat(4000))].length, 4000);
  assert.throws(() => validateMessage('😀'.repeat(4001)));
  assert.throws(() => validateMessage(' \n '));
});
test('feedback alone never implies assignment completion', () => {
  assert.equal(resolveRoutineStatus({ status: 'scheduled', scheduledDate: '2026-11-09' }, '2026-11-09')?.status, 'neutral');
});
