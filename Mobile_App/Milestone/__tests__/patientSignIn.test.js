import React from 'react';
import { AppState, TextInput, Text } from 'react-native';
import Renderer from 'react-test-renderer';
import UnlockGate from '../components/UnlockGate';
import { supabase } from '../lib/supabase';
import { fetchMyPatientProfile } from '../lib/patientApi';
import { loadLocalExtras, clearLocalExtras } from '../auth/localPatientExtras';
import { defaultPreferences } from '../auth/preferences';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../auth/profilePhoto', () => ({ chooseProfilePhoto: jest.fn() }));
jest.mock('../lib/patientApi', () => ({ fetchMyPatientProfile: jest.fn(), clearMyPendingOtp: jest.fn(async () => {}) }));
jest.mock('../auth/localPatientExtras', () => ({ loadLocalExtras: jest.fn(), clearLocalExtras: jest.fn(async () => {}), saveLocalExtras: jest.fn(async () => true) }));
jest.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { auth: {
  startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn(), getSession: jest.fn(), onAuthStateChange: jest.fn(), verifyOtp: jest.fn(), signOut: jest.fn(),
} } }));

let renderer, authChanged, background;
const patient = { id: 'patient-id', name: 'Patient', email: 'patient@example.com', phone: '' };
const auth = { user: { id: 'auth-id' } };
const localExtras = () => ({ preferredName: '', dateOfBirth: '', photoUri: null, pin: null, preferences: defaultPreferences() });
function button(label) { return renderer.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0]; }
async function fill(label, value) { await Renderer.act(async () => renderer.root.findAllByType(TextInput).find(n => n.props.accessibilityLabel === label).props.onChangeText(value)); }
async function press(label) { await Renderer.act(async () => button(label).props.onPress()); }
async function mount() { await Renderer.act(async () => { renderer = Renderer.create(<UnlockGate>{({ profile, onLock }) => <><Text>{profile.fullName}</Text>{onLock && <Text accessibilityLabel="Lock" onPress={onLock}>Lock</Text>}</>}</UnlockGate>); }); }

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  fetchMyPatientProfile.mockResolvedValue(patient);
  loadLocalExtras.mockResolvedValue(localExtras());
  supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
  supabase.auth.onAuthStateChange.mockImplementation(cb => { authChanged = cb; return { data: { subscription: { unsubscribe: jest.fn() } } }; });
  supabase.auth.verifyOtp.mockResolvedValue({ error: null });
  supabase.auth.signOut.mockImplementation(async () => { authChanged('SIGNED_OUT', null); return { error: null }; });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, cb) => { background = cb; return { remove: jest.fn() }; });
});
afterEach(async () => { await Renderer.act(async () => renderer?.unmount()); jest.restoreAllMocks(); jest.useRealTimers(); });

test('verifies a provider-issued code, loads the linked patient, and clears on logout', async () => {
  supabase.auth.verifyOtp.mockImplementation(async () => { authChanged('SIGNED_IN', auth); return { error: null }; });
  await mount();
  expect(button('Sign in')).toBeDefined();
  await fill('Email address', ' patient@example.com ');
  await fill('Login code', '123456');
  await press('Sign in');
  await Renderer.act(async () => jest.runOnlyPendingTimers());
  expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ email: 'patient@example.com', token: '123456', type: 'magiclink' });
  expect(loadLocalExtras).toHaveBeenCalledWith('auth-id');
  expect(button('Sign in')).toBeUndefined();
  await Renderer.act(async () => { authChanged('SIGNED_OUT', null); jest.runOnlyPendingTimers(); });
  expect(button('Sign in')).toBeDefined();
});

test('restores account-bound settings and locks again after backgrounding', async () => {
  supabase.auth.getSession.mockResolvedValue({ data: { session: auth } });
  loadLocalExtras.mockResolvedValue({ ...localExtras(), pin: '6789' });
  await mount();
  expect(button('Unlock Milestone')).toBeDefined();
  await fill('Your PIN', '6789');
  await press('Unlock Milestone');
  expect(button('Unlock Milestone')).toBeUndefined();
  await Renderer.act(async () => background('background'));
  expect(button('Unlock Milestone')).toBeDefined();
});

test('an authenticated account without a patient link is signed out', async () => {
  supabase.auth.getSession.mockResolvedValue({ data: { session: auth } });
  fetchMyPatientProfile.mockResolvedValue(null);
  await mount();
  await Renderer.act(async () => jest.runOnlyPendingTimers());
  expect(clearLocalExtras).toHaveBeenCalledWith('auth-id');
  expect(supabase.auth.signOut).toHaveBeenCalled();
  expect(button('Sign in')).toBeDefined();
});
