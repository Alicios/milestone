import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { loadMockSession, saveMockSession } from '../auth/mockPatientStorage';
import { createMockSession, MOCK_PATIENT } from '../auth/mockPatient';
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }));
jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ regionCode: 'US' }]) }));
const session = createMockSession(MOCK_PATIENT, { email: 'frank@example.com', preferredName: '', dateOfBirth: '', pinEnabled: true, pin: '9876' });
const originalPlatform = Platform.OS;
afterEach(() => { Platform.OS = originalPlatform; delete global.localStorage; jest.resetAllMocks(); });
test('round trips native sessions using SecureStore', async () => {
  Platform.OS = 'ios'; expect(await saveMockSession(session)).toBe(true);
  SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(session)); expect(await loadMockSession()).toEqual(session);
});
test('invalid or unavailable storage falls back to onboarding', async () => {
  SecureStore.getItemAsync.mockResolvedValue('{bad'); expect(await loadMockSession()).toBeNull();
  SecureStore.getItemAsync.mockResolvedValue('{"profile":{}}'); expect(await loadMockSession()).toBeNull();
  SecureStore.getItemAsync.mockRejectedValue(new Error('Unavailable')); expect(await loadMockSession()).toBeNull();
  SecureStore.setItemAsync.mockRejectedValue(new Error('Unavailable')); expect(await saveMockSession(session)).toBe(false);
});
test('browser preview uses localStorage and tolerates blocked storage', async () => {
  Platform.OS = 'web'; global.localStorage = { getItem: jest.fn(() => JSON.stringify(session)), setItem: jest.fn() };
  expect(await loadMockSession()).toEqual(session); expect(await saveMockSession(session)).toBe(true);
  global.localStorage.setItem.mockImplementation(() => { throw new Error('Blocked'); });
  expect(await saveMockSession(session)).toBe(false); expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});
