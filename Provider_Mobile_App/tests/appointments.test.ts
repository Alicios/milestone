import test from 'node:test';
import assert from 'node:assert/strict';
import { appointmentTimes, appointmentError } from '../src/lib/appointments';

test('appointment input converts device-local time to UTC with the requested duration', () => {
  const result = appointmentTimes('2030-12-01', '14:30', '45', 0);
  assert.equal(result.starts_at, new Date(2030, 11, 1, 14, 30).toISOString());
  assert.equal(Date.parse(result.ends_at) - Date.parse(result.starts_at), 45 * 60000);
});
test('invalid dates, past times, and invalid durations cannot be booked', () => {
  for (const [date, time, duration] of [['2030-02-30', '09:00', '30'], ['2030-12-01', '24:00', '30'], ['2030-12-01', '09:00', '0'], ['2030-12-01', '09:00', '481'], ['2030-12-01', '09:00', '3.5']]) assert.throws(() => appointmentTimes(date, time, duration, 0));
  assert.throws(() => appointmentTimes('2020-01-01', '09:00', '30'), /future/);
  assert.match(appointmentError({ code: '23P01' }), /overlaps/);
});
