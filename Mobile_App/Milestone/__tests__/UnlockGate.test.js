import React from 'react';
import { AppState, Pressable, Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import UnlockGate from '../components/UnlockGate';
import { PatientSessionContext } from '../auth/PatientSession';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../auth/profilePhoto', () => ({ chooseProfilePhoto: jest.fn() }));

// UnlockGate/SignInScreen/PatientSetup only ever reach Supabase through
// usePatientSession() — mocking the whole module (rather than lib/supabase)
// avoids pulling in Expo's env-var virtual module, which Jest's default
// CommonJS transform can't load, and lets each test drive the four branch
// states (loading / signed out / profile error / needs local setup / normal)
// directly instead of going through a real sign-in.
const mockSession = {
  authUser: null,
  loading: false,
  profileError: '',
  needsLocalSetup: false,
  session: null,
  storageWarning: '',
  verifyCode: jest.fn(async () => {}),
  signOut: jest.fn(async () => {}),
  completeLocalProfile: jest.fn(),
  updateProfile: jest.fn(),
  updatePreferences: jest.fn(),
  changePin: jest.fn(),
};

jest.mock('../auth/PatientSession', () => {
  // A fresh, dependency-free context — not jest.requireActual, which would
  // still execute the real module and its lib/supabase.js import chain.
  const { createContext } = jest.requireActual('react');
  return {
    PatientSessionContext: createContext(null),
    PatientSessionProvider: ({ children }) => children,
    usePatientSession: () => mockSession,
  };
});

let renderer;
let background;

function patientHome({ onLock, profile }) {
  return <><Text>Patient profile home: {profile.preferredName}</Text>{onLock && <Pressable accessibilityRole="button" accessibilityLabel="Lock Milestone" onPress={onLock}><Text>Lock</Text></Pressable>}</>;
}
function textIncludes(value) {
  const textOf = node => node.children.map(child => typeof child === 'string' ? child : textOf(child)).join('');
  return renderer.root.findAllByType(Text).some(node => textOf(node).includes(value));
}
function button(label) {
  return renderer.root.findAll(node => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function').find(node => node.props.accessibilityLabel === label);
}
async function press(label) { await ReactTestRenderer.act(async () => button(label).props.onPress()); }
async function fill(label, value) {
  await ReactTestRenderer.act(async () => renderer.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label).props.onChangeText(value));
}
async function open() {
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<UnlockGate>{patientHome}</UnlockGate>); });
}
function session(overrides = {}) {
  return { profile: { id: 'patient-1', fullName: 'Frank Murgolo', phone: '', preferredName: 'Frankie', dateOfBirth: '', photoUri: null, email: 'frank@example.com' }, pin: null, preferences: { appearance: 'system', reminders: { enabled: false, days: [], time: '09:00' } }, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockSession, {
    authUser: null, loading: false, profileError: '', needsLocalSetup: false, session: null, storageWarning: '',
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback) => { background = callback; return { remove: jest.fn() }; });
});
afterEach(async () => { if (renderer) await ReactTestRenderer.act(async () => renderer.unmount()); jest.restoreAllMocks(); });

test('shows a spinner while loading', async () => {
  mockSession.loading = true;
  await open();
  expect(renderer.root.findAllByProps({ accessibilityLabel: 'Loading your account' }).length).toBeGreaterThan(0);
});

test('with no authenticated user, shows sign-in and wires verifyCode', async () => {
  await open();
  await fill('Email address', 'frank@example.com');
  await fill('Login code', '123456');
  await press('Sign in');
  expect(mockSession.verifyCode).toHaveBeenCalledWith('frank@example.com', '123456');
});

test('a profile load error offers sign out instead of the app', async () => {
  mockSession.authUser = { id: 'user-1' };
  mockSession.profileError = 'Unable to load your profile.';
  await open();
  expect(textIncludes('Unable to load your profile.')).toBe(true);
  await press('Sign out and try again');
  expect(mockSession.signOut).toHaveBeenCalled();
});

test('needing local setup renders PatientSetup and wires completeLocalProfile', async () => {
  mockSession.authUser = { id: 'user-1' };
  mockSession.needsLocalSetup = true;
  mockSession.session = { profile: { fullName: 'Frank Murgolo', phone: '' } };
  await open();
  await fill('Preferred name (optional)', 'Frankie');
  await press('Finish setup');
  expect(mockSession.completeLocalProfile).toHaveBeenCalledWith(expect.objectContaining({ preferredName: 'Frankie', pin: null }));
  expect(textIncludes('Patient profile home: Frankie')).toBe(false); // mock doesn't re-render completeLocalProfile's effect on session
});

test('no PIN means direct access and no background lock', async () => {
  mockSession.authUser = { id: 'user-1' };
  mockSession.session = session();
  await open();
  expect(textIncludes('Patient profile home: Frankie')).toBe(true);
  expect(button('Lock Milestone')).toBeUndefined();
  await ReactTestRenderer.act(async () => background('background'));
  expect(textIncludes('Patient profile home')).toBe(true);
});

test('a PIN protects manual and background locking without unmounting home', async () => {
  mockSession.authUser = { id: 'user-1' };
  mockSession.session = session({ pin: '6789' });
  await open();
  expect(button('Unlock Milestone')).toBeDefined();
  await fill('Your PIN', '0000');
  await press('Unlock Milestone');
  expect(textIncludes('match')).toBe(true);
  await fill('Your PIN', '6789');
  await press('Unlock Milestone');
  expect(button('Unlock Milestone')).toBeUndefined();
  await press('Lock Milestone');
  await ReactTestRenderer.act(async () => background('background'));
  expect(button('Unlock Milestone')).toBeDefined();
});

test('a storage warning is shown once unlocked', async () => {
  mockSession.authUser = { id: 'user-1' };
  mockSession.session = session();
  mockSession.storageWarning = 'Your changes could not be saved on this device. You can continue, but they may be lost after restarting.';
  await open();
  expect(textIncludes('could not be saved')).toBe(true);
});
