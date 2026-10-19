import React from 'react';
import { AppState, Image, Pressable, Text, TextInput, Switch } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import UnlockGate from '../components/UnlockGate';
import { createMockSession, MOCK_PATIENT } from '../auth/mockPatient';
import { loadMockSession, saveMockSession } from '../auth/mockPatientStorage';
import { getLocales } from 'expo-localization';
import { chooseProfilePhoto } from '../auth/profilePhoto';
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../auth/mockPatientStorage', () => ({ loadMockSession: jest.fn(), saveMockSession: jest.fn() }));
jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ regionCode: 'US' }]) }));
jest.mock('../auth/profilePhoto', () => ({ chooseProfilePhoto: jest.fn() }));
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
async function open(rememberPatient = false) {
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<UnlockGate rememberPatient={rememberPatient}>{patientHome}</UnlockGate>); });
}
async function profileStep() { await fill('Phone number', '(000) 000-0000'); await press('Continue'); }
async function setup(pin = false) {
  await profileStep();
  await fill('Email address', 'frank@example.com');
  await fill('Preferred name (optional)', 'Frankie');
  if (pin) {
    await ReactTestRenderer.act(async () => renderer.root.findByType(Switch).props.onValueChange(true));
    await fill('Create PIN', '6789'); await fill('Confirm PIN', '6789');
  }
  await press('Finish setup');
}
beforeEach(() => {
  jest.clearAllMocks(); loadMockSession.mockResolvedValue(null); saveMockSession.mockResolvedValue(true);
  getLocales.mockReturnValue([{ regionCode: 'US' }]);
  chooseProfilePhoto.mockResolvedValue(null);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback) => { background = callback; return { remove: jest.fn() }; });
});
afterEach(async () => { if (renderer) await ReactTestRenderer.act(async () => renderer.unmount()); jest.restoreAllMocks(); });
test('validates phone and profile, prefills identity, and supports back navigation', async () => {
  await open(); await fill('Phone number', '123'); await press('Continue');
  expect(textIncludes('10-digit')).toBe(true);
  await fill('Phone number', '1111111111'); await press('Continue');
  expect(textIncludes('could not find')).toBe(true);
  await profileStep();
  const name = renderer.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Full name');
  expect(name.props.value).toBe('Frank Murgolo'); expect(name.props.editable).toBe(false);
  await fill('Email address', 'invalid'); await press('Finish setup'); expect(textIncludes('valid email')).toBe(true);
  await press('Back to phone number'); expect(button('Continue')).toBeDefined();
});
test('completes signup with no email address', async () => {
  await open(true); await profileStep(); await press('Finish setup');
  expect(textIncludes('Patient profile home')).toBe(true);
  expect(saveMockSession).toHaveBeenCalledWith(expect.objectContaining({ profile: expect.objectContaining({ email: '' }) }));
});
test('uses the device region and allows searching and changing the calling code', async () => {
  getLocales.mockReturnValue([{ regionCode: 'GB' }]);
  await open();
  expect(button('Country calling code').props.accessibilityHint).toContain('+44');
  await press('Country calling code');
  await fill('Search countries', 'United States');
  await press('United States (+1)');
  expect(button('Country calling code').props.accessibilityHint).toContain('+1');
  await fill('Phone number', '0000000000');
  expect(renderer.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Phone number').props.value).toBe('(000) 000-0000');
  await press('Continue');
  expect(renderer.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Phone number').props.value).toBe('+1 (000) 000-0000');
});
test('no PIN means direct access, no background lock, and no storage calls', async () => {
  await open(); await setup();
  expect(textIncludes('Patient profile home: Frankie')).toBe(true); expect(button('Lock Milestone')).toBeUndefined();
  await ReactTestRenderer.act(async () => background('background'));
  expect(textIncludes('Patient profile home')).toBe(true);
  expect(loadMockSession).not.toHaveBeenCalled(); expect(saveMockSession).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => renderer.unmount()); await open(); expect(button('Continue')).toBeDefined();
});
test('chosen PIN protects manual and background locking without unmounting home', async () => {
  await open(); await setup(true); await press('Lock Milestone');
  expect(renderer.root.findByProps({ importantForAccessibility: 'no-hide-descendants' }).props.style).toEqual({ display: 'none' });
  await fill('Your PIN', '0000'); await press('Unlock Milestone'); expect(textIncludes('match')).toBe(true);
  await fill('Your PIN', '6789'); await press('Unlock Milestone'); expect(button('Unlock Milestone')).toBeUndefined();
  await ReactTestRenderer.act(async () => background('background')); expect(button('Unlock Milestone')).toBeDefined();
});
const savedSession = createMockSession(MOCK_PATIENT, { email: 'frank@example.com', preferredName: 'Frankie', dateOfBirth: '', pinEnabled: false });
test.each([null, '6789'])('restores a saved session with PIN %s', async pin => {
  loadMockSession.mockResolvedValue({ ...savedSession, pin }); await open(true);
  expect(Boolean(button('Unlock Milestone'))).toBe(Boolean(pin)); expect(textIncludes('Patient profile home')).toBe(!pin);
});
test('failed persistence allows entry with a visible warning', async () => {
  saveMockSession.mockResolvedValue(false); await open(true); await setup();
  expect(saveMockSession).toHaveBeenCalledWith(savedSession); expect(textIncludes('could not be saved')).toBe(true); expect(textIncludes('Patient profile home')).toBe(true);
});
test('previews, changes and removes a photo, and saves the chosen photo with the profile', async () => {
  const photoUri = 'data:image/jpeg;base64,YWJj';
  await open(true); await profileStep();
  chooseProfilePhoto.mockResolvedValue(photoUri);
  await press('Add profile photo');
  const hasPhoto = () => renderer.root.findAllByType(Image).some(node => node.props.source?.uri === photoUri);
  expect(hasPhoto()).toBe(true);
  chooseProfilePhoto.mockResolvedValue(null);
  await press('Change profile photo'); expect(hasPhoto()).toBe(true);
  chooseProfilePhoto.mockRejectedValue(new Error('No photo access'));
  await press('Change profile photo'); expect(textIncludes('Check photo access')).toBe(true); expect(hasPhoto()).toBe(true);
  await press('Remove profile photo'); expect(hasPhoto()).toBe(false);
  expect(button('Add profile photo')).toBeDefined();
  chooseProfilePhoto.mockResolvedValue(photoUri);
  await press('Add profile photo'); await fill('Email address', 'frank@example.com'); await press('Finish setup');
  expect(saveMockSession).toHaveBeenCalledWith(expect.objectContaining({ profile: expect.objectContaining({ photoUri }) }));
});
