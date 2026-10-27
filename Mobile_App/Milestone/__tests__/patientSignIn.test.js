import React from 'react';
import { AppState, TextInput, Text } from 'react-native';
import Renderer from 'react-test-renderer';
import UnlockGate from '../components/UnlockGate';
import PatientSetup from '../components/PatientSetup';
import { supabase } from '../lib/supabase';
import { fetchSharedPatientProfile } from '../lib/patientProfile';
import { loadPatientSession } from '../auth/patientStorage';
import { createPatientSession } from '../auth/patientAccount';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../auth/profilePhoto', () => ({ chooseProfilePhoto: jest.fn() }));
jest.mock('../lib/patientProfile', () => ({ fetchSharedPatientProfile: jest.fn() }));
jest.mock('../auth/patientStorage', () => ({ loadPatientSession: jest.fn(), savePatientSession: jest.fn(async () => true) }));
jest.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { auth: {
  startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn(), getSession: jest.fn(), onAuthStateChange: jest.fn(), signInWithPassword: jest.fn(), signOut: jest.fn(),
} } }));
let renderer, authChanged, background;
const patient = { databasePatientId: 'patient-id', fullName: 'Patient', email: 'patient@example.com', phone: '' };
const auth = { user: { id: 'auth-id' } };
function button(label) { return renderer.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0]; }
async function fill(label, value) { await Renderer.act(async () => renderer.root.findAllByType(TextInput).find(n => n.props.accessibilityLabel === label).props.onChangeText(value)); }
async function press(label) { await Renderer.act(async () => button(label).props.onPress()); }
async function mount() { await Renderer.act(async () => { renderer = Renderer.create(<UnlockGate>{({ profile, onLock }) => <><Text>{profile.fullName}</Text>{onLock && <Text accessibilityLabel="Lock" onPress={onLock}>Lock</Text>}</>}</UnlockGate>); }); }
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  fetchSharedPatientProfile.mockResolvedValue(patient); loadPatientSession.mockResolvedValue(null);
  supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
  supabase.auth.onAuthStateChange.mockImplementation(cb => { authChanged = cb; return { data: { subscription: { unsubscribe: jest.fn() } } }; });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, cb) => { background = cb; return { remove: jest.fn() }; });
});
afterEach(async () => { await Renderer.act(async () => renderer?.unmount()); jest.restoreAllMocks(); jest.useRealTimers(); });
test('signs in using real credentials, loads the authenticated patient, and clears on logout', async () => {
  supabase.auth.signInWithPassword.mockImplementation(async () => { authChanged('SIGNED_IN', auth); return { error: null }; });
  await mount();
  expect(button('Sign in')).toBeDefined();
  await fill('Email address', ' patient@example.com '); await fill('Password', 'password'); await press('Sign in');
  await Renderer.act(async () => jest.runOnlyPendingTimers());
  expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'patient@example.com', password: 'password' });
  expect(loadPatientSession).toHaveBeenCalledWith('auth-id');
  expect(button('Sign in')).toBeUndefined();
  await Renderer.act(async () => { authChanged('SIGNED_OUT', null); jest.runOnlyPendingTimers(); });
  expect(button('Sign in')).toBeDefined();
});
test('restores only account-bound settings and retains PIN background locking', async () => {
  supabase.auth.getSession.mockResolvedValue({ data: { session: auth } });
  loadPatientSession.mockResolvedValue({ ...createPatientSession({ ...patient, id: 'auth-id' }), pin: '6789' });
  await mount(); expect(button('Unlock Milestone')).toBeDefined();
  await fill('Your PIN', '6789'); await press('Unlock Milestone');
  expect(button('Unlock Milestone')).toBeUndefined();
  await Renderer.act(async () => background('background'));
  expect(button('Unlock Milestone')).toBeDefined();
});
test('an authenticated account with no patient link cannot open the dashboard', async () => {
  supabase.auth.getSession.mockResolvedValue({ data: { session: auth } });
  fetchSharedPatientProfile.mockRejectedValue(new Error('Your patient record could not be found.'));
  await mount(); expect(button('Sign in')).toBeDefined();
  expect(renderer.root.findByType(PatientSetup).props.authError).toContain('could not be found');
});
