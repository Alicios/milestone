import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { File } from 'expo-file-system';
import { loadPatientSession, savePatientSession } from '../auth/patientStorage';
import { createPatientSession } from '../auth/patientAccount';
const TEST_PATIENT = { id: 'test-auth-user', databasePatientId: 'test-patient', fullName: 'Patient', phone: '', email: 'patient@example.com' };
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }));
jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ regionCode: 'US' }]) }));
const mockPhotoFile = { uri: 'file:///documents/milestone-profile-photo.jpg', exists: true, write: jest.fn() };
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { document: 'file:///documents' } }));
const session = createPatientSession(TEST_PATIENT, { email: 'frank@example.com', preferredName: '', dateOfBirth: '', pinEnabled: true, pin: '9876' });
const originalPlatform = Platform.OS;
beforeEach(() => { File.mockImplementation(() => mockPhotoFile); mockPhotoFile.exists = true; });
afterEach(() => { Platform.OS = originalPlatform; delete global.localStorage; jest.resetAllMocks(); });
test('round trips native sessions using SecureStore', async () => {
  Platform.OS = 'ios'; expect(await savePatientSession(session)).toBe(true);
  SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(session)); expect(await loadPatientSession(TEST_PATIENT.id)).toEqual(session);
});
test('invalid or unavailable storage falls back to onboarding', async () => {
  SecureStore.getItemAsync.mockResolvedValue('{bad'); expect(await loadPatientSession(TEST_PATIENT.id)).toBeNull();
  SecureStore.getItemAsync.mockResolvedValue('{"profile":{}}'); expect(await loadPatientSession(TEST_PATIENT.id)).toBeNull();
  SecureStore.getItemAsync.mockRejectedValue(new Error('Unavailable')); expect(await loadPatientSession(TEST_PATIENT.id)).toBeNull();
  SecureStore.setItemAsync.mockRejectedValue(new Error('Unavailable')); expect(await savePatientSession(session)).toBe(false);
});
test('browser preview uses localStorage and tolerates blocked storage', async () => {
  Platform.OS = 'web'; global.localStorage = { getItem: jest.fn(() => JSON.stringify(session)), setItem: jest.fn() };
  expect(await loadPatientSession(TEST_PATIENT.id)).toEqual(session); expect(await savePatientSession(session)).toBe(true);
  global.localStorage.setItem.mockImplementation(() => { throw new Error('Blocked'); });
  expect(await savePatientSession(session)).toBe(false); expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});
test('native persistence writes image bytes to app documents and stores only the URI in SecureStore', async () => {
  Platform.OS = 'ios';
  const withPhoto = { ...session, profile: { ...session.profile, photoUri: 'data:image/jpeg;base64,YWJj' } };
  expect(await savePatientSession(withPhoto)).toBe(true);
  expect(mockPhotoFile.write).toHaveBeenCalledWith('YWJj', { encoding: 'base64' });
  const saved = JSON.parse(SecureStore.setItemAsync.mock.calls[0][1]);
  expect(saved.profile.photoUri).toBe(mockPhotoFile.uri);
  expect(withPhoto.profile.photoUri).toBe('data:image/jpeg;base64,YWJj');
  SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(saved));
  expect((await loadPatientSession(TEST_PATIENT.id)).profile.photoUri).toBe(mockPhotoFile.uri);
  mockPhotoFile.exists = false;
  expect((await loadPatientSession(TEST_PATIENT.id)).profile.photoUri).toBeNull();
});
test('browser persistence preserves the photo data with the profile', async () => {
  Platform.OS = 'web';
  const withPhoto = { ...session, profile: { ...session.profile, photoUri: 'data:image/jpeg;base64,YWJj' } };
  global.localStorage = { getItem: jest.fn(), setItem: jest.fn() };
  expect(await savePatientSession(withPhoto)).toBe(true);
  global.localStorage.getItem.mockReturnValue(global.localStorage.setItem.mock.calls[0][1]);
  expect(await loadPatientSession(TEST_PATIENT.id)).toEqual(withPhoto);
  expect(File).not.toHaveBeenCalled();
});
