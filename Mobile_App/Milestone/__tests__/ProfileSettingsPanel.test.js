import React, { useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Pressable, Switch, Text, View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import UnlockGate from '../components/UnlockGate';
import ProfileAvatar from '../components/ProfileAvatar';
import { createMockSession, MOCK_PATIENT } from '../auth/mockPatient';
import { loadMockSession, saveMockSession } from '../auth/mockPatientStorage';
import { usePatientSession } from '../auth/PatientSession';
import { chooseProfilePhoto } from '../auth/profilePhoto';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../auth/mockPatientStorage', () => ({ loadMockSession: jest.fn(), saveMockSession: jest.fn() }));
jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ regionCode: 'US' }]) }));
jest.mock('../auth/profilePhoto', () => ({ chooseProfilePhoto: jest.fn() }));

let renderer;
let sessionApi;
let background;
const original = () => createMockSession(MOCK_PATIENT, { email: 'frank@example.com', preferredName: '', dateOfBirth: '', pinEnabled: false });
function Home({ profile, onOpenProfile, onLock }) {
  sessionApi = usePatientSession();
  const [progress, setProgress] = useState(0);
  return <View><ProfileAvatar profile={profile} onPress={onOpenProfile} /><Text>{profile.email}</Text><Text>Progress: {progress}</Text><Pressable accessibilityRole="button" accessibilityLabel="Advance routine" onPress={() => setProgress(value => value + 1)} />{onLock && <Pressable accessibilityRole="button" accessibilityLabel="Lock Milestone" onPress={onLock} />}</View>;
}
function element(label, prop = 'onPress') {
  const match = renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props[prop] === 'function')[0];
  if (!match) throw new Error('Missing control: ' + label);
  return match;
}
async function press(label) { await ReactTestRenderer.act(async () => element(label).props.onPress()); }
async function fill(label, value) { await ReactTestRenderer.act(async () => element(label, 'onChangeText').props.onChangeText(value)); }
async function toggle(label, value) { await ReactTestRenderer.act(async () => renderer.root.findAllByType(Switch).find(node => node.props.accessibilityLabel === label).props.onValueChange(value)); }
function hasText(text) {
  const textOf = node => node.children.map(child => typeof child === 'string' ? child : textOf(child)).join('');
  return renderer.root.findAllByType(Text).some(node => textOf(node).includes(text));
}
async function open(saved = original()) {
  loadMockSession.mockResolvedValue(saved);
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<UnlockGate rememberPatient>{props => <Home {...props} />}</UnlockGate>); });
  if (saved.pin) { await fill('Your PIN', saved.pin); await press('Unlock Milestone'); }
  await press('Open profile and settings');
}
beforeEach(() => {
  jest.clearAllMocks();
  saveMockSession.mockResolvedValue(true);
  chooseProfilePhoto.mockResolvedValue(null);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  jest.spyOn(Animated, 'timing').mockImplementation((value, config) => ({ start: callback => { value.setValue(config.toValue); callback?.({ finished: true }); }, stop: jest.fn() }));
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback) => { background = callback; return { remove: jest.fn() }; });
});
afterEach(async () => { if (renderer) await ReactTestRenderer.act(async () => renderer.unmount()); jest.restoreAllMocks(); });

test('preserves drafts across tabs, validates email, updates profile, and keeps routine progress', async () => {
  await open(); await press('Advance routine');
  await fill('Preferred name', 'Frankie'); await fill('Email address', 'bad');
  await press('Settings'); await press('Profile');
  expect(element('Preferred name', 'onChangeText').props.value).toBe('Frankie');
  await press('Save profile'); expect(hasText('valid email')).toBe(true);
  await fill('Email address', 'frankie@example.com'); await press('Save profile');
  expect(sessionApi.session.profile.preferredName).toBe('Frankie');
  expect(sessionApi.session.profile.email).toBe('frankie@example.com');
  expect(hasText('Progress: 1')).toBe(true);
  await press('Close profile and settings');
  await press('Open profile and settings');
  expect(element('Profile').props.accessibilityState.selected).toBe(true);
});
test('confirms discarding unsaved profile changes', async () => {
  await open(); await fill('Preferred name', 'Unsaved');
  await press('Dismiss profile panel'); expect(hasText('Discard profile edits?')).toBe(true);
  await press('Keep editing'); expect(element('Preferred name', 'onChangeText').props.value).toBe('Unsaved');
  await press('Cancel'); await press('Discard changes');
  expect(sessionApi.session.profile.preferredName).toBe('');
});
test('changes appearance immediately and validates reminder schedules', async () => {
  await open(); await press('Settings'); await press('Dark');
  expect(sessionApi.preferences.appearance).toBe('dark');
  await toggle('Exercise reminders', true);
  for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']) await press(day);
  await press('Sat'); expect(sessionApi.preferences.reminders.days).toEqual([6]);
  expect(hasText('Choose at least one day')).toBe(true);
  await fill('Reminder time (HH:MM)', '25:00');
  await ReactTestRenderer.act(async () => element('Reminder time (HH:MM)', 'onChangeText').props.onBlur());
  expect(sessionApi.preferences.reminders.time).toBe('09:00');
  await fill('Reminder time (HH:MM)', '17:30');
  expect(sessionApi.preferences.reminders.time).toBe('17:30');
  await toggle('Exercise reminders', false); expect(sessionApi.preferences.reminders.enabled).toBe(false);
});
test('requires the current PIN to change or disable protection', async () => {
  await open(); await press('Settings'); await toggle('Protect this app with a PIN', true);
  await fill('New PIN', '1234'); await fill('Confirm new PIN', '4321'); await press('Save PIN');
  expect(sessionApi.session.pin).toBeNull();
  await fill('Confirm new PIN', '1234'); await press('Save PIN'); expect(sessionApi.session.pin).toBe('1234');
  await press('Change PIN'); await fill('Current PIN', '0000'); await fill('New PIN', '9876'); await fill('Confirm new PIN', '9876'); await press('Save PIN');
  expect(hasText('current PIN does not match')).toBe(true); expect(sessionApi.session.pin).toBe('1234');
  await fill('Current PIN', '1234'); await press('Save PIN'); expect(sessionApi.session.pin).toBe('9876');
  await toggle('Protect this app with a PIN', false); await press('Cancel PIN change'); expect(sessionApi.session.pin).toBe('9876');
  await toggle('Protect this app with a PIN', false); await fill('Current PIN', '9876'); await press('Disable PIN'); expect(sessionApi.session.pin).toBeNull();
});
test('retains profile/photo drafts behind the lock when choosing a photo backgrounds the app', async () => {
  await open({ ...original(), pin: '1234' }); await fill('Preferred name', 'Draft');
  chooseProfilePhoto.mockImplementation(async () => { background('background'); return 'data:image/jpeg;base64,YWJj'; });
  await press('Add profile photo');
  expect(renderer.root.findByProps({ importantForAccessibility: 'no-hide-descendants' }).props.style).toEqual({ display: 'none' });
  await fill('Your PIN', '1234'); await press('Unlock Milestone');
  expect(element('Preferred name', 'onChangeText').props.value).toBe('Draft');
  await press('Save profile'); expect(sessionApi.session.profile.photoUri).toBe('data:image/jpeg;base64,YWJj');
});
test('serializes persistence and merges rapid profile/settings changes', async () => {
  await open(); const finish = [];
  saveMockSession.mockImplementation(() => new Promise(resolve => finish.push(resolve)));
  await ReactTestRenderer.act(async () => {
    sessionApi.updateProfile({ preferredName: 'First' });
    sessionApi.updatePreferences({ appearance: 'dark' });
    sessionApi.updateProfile({ email: 'new@example.com' });
  });
  expect(saveMockSession).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => finish.shift()(true));
  expect(saveMockSession).toHaveBeenCalledTimes(2);
  await ReactTestRenderer.act(async () => finish.shift()(false));
  expect(hasText('could not be saved')).toBe(true);
  await ReactTestRenderer.act(async () => finish.shift()(true));
  expect(saveMockSession.mock.calls[2][0]).toEqual(expect.objectContaining({ profile: expect.objectContaining({ preferredName: 'First', email: 'new@example.com' }), preferences: expect.objectContaining({ appearance: 'dark' }) }));
});
