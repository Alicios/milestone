import React from 'react';
import { AppState, Pressable, Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import UnlockGate from '../components/UnlockGate';
import * as unlock from '../auth/deviceUnlock';

jest.setTimeout(30000);

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../auth/deviceUnlock', () => ({
  getBiometricSupport: jest.fn(), readUnlockRecord: jest.fn(), setUpUnlock: jest.fn(),
  unlockWithBiometrics: jest.fn(), unlockWithSecret: jest.fn(),
}));

const record = { version: 1, failures: 0, lockedUntil: 0, biometricsEnabled: true };
let renderer;
let changeAppState;

function protectedApp({ onLock }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Lock Milestone" onPress={onLock}><Text>Protected app</Text></Pressable>;
}

function button(label) {
  return renderer.root.findAll(node => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')
    .find(node => node.props.accessibilityLabel === label);
}

async function press(label) {
  const found = button(label);
  if (!found) throw new Error(`Missing button: ${label}`);
  await ReactTestRenderer.act(async () => found.props.onPress());
}

async function input(label, value) {
  await ReactTestRenderer.act(async () => {
    renderer.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label).props.onChangeText(value);
  });
}

function textIncludes(value) {
  const textOf = node => node.children.map(child => typeof child === 'string' ? child : textOf(child)).join('');
  return renderer.root.findAllByType(Text).some(node => textOf(node).includes(value));
}

beforeEach(() => {
  jest.clearAllMocks();
  unlock.readUnlockRecord.mockResolvedValue(record);
  unlock.getBiometricSupport.mockResolvedValue({ available: true, label: 'Fingerprint', reason: '' });
  unlock.unlockWithSecret.mockResolvedValue(record);
  unlock.unlockWithBiometrics.mockResolvedValue(record);
  unlock.setUpUnlock.mockResolvedValue(record);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback) => {
    changeAppState = callback;
    return { remove: jest.fn() };
  });
});

afterEach(async () => {
  if (renderer) await ReactTestRenderer.act(async () => renderer.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function mount() {
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<UnlockGate>{protectedApp}</UnlockGate>); });
}

test('starts locked, unlocks only after a correct PIN, and hides the app on explicit lock', async () => {
  await mount();
  expect(textIncludes('Protected app')).toBe(false);
  unlock.unlockWithSecret.mockRejectedValueOnce(new Error('That PIN doesn’t match. Please try again.'));
  await input('Your PIN', '000000');
  await press('Unlock Milestone');
  expect(textIncludes('doesn’t match')).toBe(true);
  expect(textIncludes('Protected app')).toBe(false);
  await input('Your PIN', '582694');
  await press('Unlock Milestone');
  expect(unlock.unlockWithSecret).toHaveBeenLastCalledWith('pin', '582694', false);
  expect(textIncludes('Protected app')).toBe(true);
  await press('Lock Milestone');
  expect(renderer.root.findByProps({ importantForAccessibility: 'no-hide-descendants' }).props.style).toEqual({ display: 'none' });
  expect(button('Unlock Milestone')).toBeDefined();
});

test('supports password login and clears the field when changing methods', async () => {
  await mount();
  await input('Your PIN', '582694');
  await press('Use password');
  expect(renderer.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Your password').props.value).toBe('');
  await input('Your password', 'test-password');
  await press('Unlock Milestone');
  expect(unlock.unlockWithSecret).toHaveBeenCalledWith('password', 'test-password', false);
  expect(textIncludes('Protected app')).toBe(true);
});

test('canceled biometrics stay locked and the password remains available', async () => {
  await mount();
  unlock.unlockWithBiometrics.mockRejectedValueOnce(new Error('Unlock canceled. You can use your PIN or password.'));
  await press('Unlock with fingerprint');
  expect(textIncludes('Unlock canceled')).toBe(true);
  expect(textIncludes('Protected app')).toBe(false);
  await press('Use password');
  await input('Your password', 'test-password');
  await press('Unlock Milestone');
  expect(textIncludes('Protected app')).toBe(true);
});

test('successful biometrics unlock and backgrounding relocks the app', async () => {
  await mount();
  await press('Unlock with fingerprint');
  expect(textIncludes('Protected app')).toBe(true);
  await ReactTestRenderer.act(async () => changeAppState('background'));
  expect(button('Unlock Milestone')).toBeDefined();
  expect(renderer.root.findByProps({ importantForAccessibility: 'no-hide-descendants' })).toBeDefined();
});

test('an authentication finishing after backgrounding cannot reopen the app', async () => {
  let finishUnlock;
  unlock.unlockWithSecret.mockImplementation(() => new Promise(resolve => { finishUnlock = resolve; }));
  await mount();
  await input('Your PIN', '582694');
  await press('Unlock Milestone');
  await ReactTestRenderer.act(async () => changeAppState('background'));
  await ReactTestRenderer.act(async () => finishUnlock(record));
  expect(textIncludes('Protected app')).toBe(false);
  expect(button('Unlock Milestone')).toBeDefined();
});

test('first-run setup validates confirmation before creating credentials', async () => {
  unlock.readUnlockRecord.mockResolvedValue(null);
  await mount();
  expect(textIncludes('Set up your unlock')).toBe(true);
  await input('Create password', 'test-password');
  await input('Confirm password', 'different-password');
  await input('Create PIN', '582694');
  await input('Confirm PIN', '582694');
  await press('Save PIN and password');
  expect(textIncludes('passwords do not match')).toBe(true);
  expect(unlock.setUpUnlock).not.toHaveBeenCalled();
  await input('Confirm password', 'test-password');
  await press('Save PIN and password');
  expect(unlock.setUpUnlock).toHaveBeenCalledWith({ pin: '582694', password: 'test-password', enableBiometrics: false });
  expect(textIncludes('Protected app')).toBe(true);
});

test('does not expose app contents when saved settings cannot be read', async () => {
  unlock.readUnlockRecord.mockRejectedValueOnce(new Error('Storage unavailable'));
  await mount();
  expect(textIncludes('couldn’t read')).toBe(true);
  expect(textIncludes('Protected app')).toBe(false);
  await press('Retry loading unlock settings');
  expect(button('Unlock Milestone')).toBeDefined();
  expect(textIncludes('Protected app')).toBe(false);
});

test('keeps unlock disabled during cooldown and reenables it after expiry', async () => {
  jest.useFakeTimers();
  unlock.readUnlockRecord.mockResolvedValue({ ...record, lockedUntil: Date.now() + 30000 });
  await mount();
  expect(button('Unlock Milestone').props.disabled).toBe(true);
  expect(textIncludes('30 seconds')).toBe(true);
  await ReactTestRenderer.act(async () => jest.advanceTimersByTime(30000));
  expect(button('Unlock Milestone').props.disabled).toBe(false);
  expect(textIncludes('Too many attempts')).toBe(false);
});
