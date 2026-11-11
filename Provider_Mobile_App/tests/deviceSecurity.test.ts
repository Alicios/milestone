import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceUnlockOutcome, endDeviceSession, logoutMarker } from '../src/auth/deviceSecurity';

test('cancellation never unlocks; absent device credentials require provider sign-in', () => {
  assert.equal(deviceUnlockOutcome({ success: true }), 'unlocked');
  for (const error of ['user_cancel', 'system_cancel', 'authentication_failed', 'lockout']) assert.equal(deviceUnlockOutcome({ success: false, error }), 'retry');
  for (const error of ['not_available', 'not_enrolled', 'passcode_not_set']) assert.equal(deviceUnlockOutcome({ success: false, error }), 'signIn');
});
test('failed logout marker still attempts session revocation and credential deletion', async () => {
  const calls: string[] = [];
  await endDeviceSession({ getItem: async () => null, setItem: async () => { calls.push('marker'); throw new Error('storage'); }, removeItem: async () => { calls.push('remove'); } }, 'session', async () => { calls.push('revoke'); return { error: null }; });
  assert.deepEqual(calls, ['marker', 'revoke', 'remove']);
});
test('offline sign-out still removes credentials and leaves a durable restoration block', async () => {
  const items = new Map([['session', 'credentials']]);
  await assert.rejects(endDeviceSession({ getItem: async key => items.get(key) ?? null, setItem: async (key, value) => { items.set(key, value); }, removeItem: async key => { items.delete(key); } }, 'session', async () => { throw new Error('offline'); }), /cleared this device/);
  assert.equal(items.has('session'), false);
  assert.equal(items.get(logoutMarker), '1');
});
test('total storage failure reports that sign-out could not be completed', async () => {
  await assert.rejects(endDeviceSession({ getItem: async () => null, setItem: async () => { throw new Error('disk'); }, removeItem: async () => { throw new Error('disk'); } }, 'session', async () => ({ error: new Error('offline') })), /could not clear saved credentials/);
});
