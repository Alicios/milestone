import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import { createVerifier, matchesVerifier } from '../auth/passwordHash';
import { readUnlockRecord, writeUnlockRecord } from '../auth/unlockStorage';
import { getBiometricSupport, initializeDefaultUnlock, setUpUnlock, unlockWithBiometrics, unlockWithSecret } from '../auth/deviceUnlock';

jest.mock('expo-constants', () => ({ __esModule: true, default: { executionEnvironment: 'bare' } }));
jest.mock('expo-local-authentication', () => ({
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2 },
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));
jest.mock('../auth/passwordHash', () => ({ createVerifier: jest.fn(), matchesVerifier: jest.fn() }));
jest.mock('../auth/unlockStorage', () => ({ readUnlockRecord: jest.fn(), writeUnlockRecord: jest.fn() }));

const saved = () => ({
  version: 1,
  pin: { salt: 'pin-salt', hash: 'pin-verifier' },
  password: { salt: 'password-salt', hash: 'password-verifier' },
  biometricsEnabled: false,
  failures: 0,
  lockedUntil: 0,
});

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'ios';
  Constants.executionEnvironment = 'bare';
  readUnlockRecord.mockResolvedValue(saved());
  writeUnlockRecord.mockResolvedValue(undefined);
  createVerifier.mockImplementation(async value => ({ salt: 'random-salt', hash: `derived-${value}` }));
  matchesVerifier.mockResolvedValue(true);
  LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
  LocalAuthentication.isEnrolledAsync.mockResolvedValue(true);
  LocalAuthentication.supportedAuthenticationTypesAsync.mockResolvedValue([1]);
  LocalAuthentication.authenticateAsync.mockResolvedValue({ success: true });
});

test('creates PIN and password verifiers only on first setup', async () => {
  readUnlockRecord.mockResolvedValue(null);
  const record = await setUpUnlock({ pin: '5826', password: 'test-password' });
  expect(createVerifier).toHaveBeenNthCalledWith(1, '5826');
  expect(createVerifier).toHaveBeenNthCalledWith(2, 'test-password');
  expect(record).not.toHaveProperty('secret');
  expect(record.biometricsEnabled).toBe(false);
  expect(writeUnlockRecord).toHaveBeenCalledWith(record);
  readUnlockRecord.mockResolvedValue(record);
  await expect(setUpUnlock({ pin: '999999', password: 'another-password' })).rejects.toThrow('already set up');
});

test('initializes the shared sample profile with PIN 0000 and password password', async () => {
  readUnlockRecord.mockResolvedValue(null);
  const record = await initializeDefaultUnlock();
  expect(createVerifier).toHaveBeenNthCalledWith(1, '0000');
  expect(createVerifier).toHaveBeenNthCalledWith(2, 'password');
  expect(record.defaultCredentialsVersion).toBe(1);
  expect(record.biometricsEnabled).toBe(false);
  expect(writeUnlockRecord).toHaveBeenCalledWith(record);
});

test('migrates previous demo credentials once and preserves biometric opt-in', async () => {
  readUnlockRecord.mockResolvedValue({ ...saved(), biometricsEnabled: true });
  const migrated = await initializeDefaultUnlock();
  expect(migrated.biometricsEnabled).toBe(true);
  expect(migrated.defaultCredentialsVersion).toBe(1);
  expect(createVerifier).toHaveBeenCalledWith('0000');
  expect(createVerifier).toHaveBeenCalledWith('password');
  const locked = { ...migrated, failures: 5, lockedUntil: Date.now() + 30000 };
  readUnlockRecord.mockResolvedValue(locked);
  createVerifier.mockClear();
  writeUnlockRecord.mockClear();
  expect(await initializeDefaultUnlock()).toEqual(locked);
  expect(createVerifier).not.toHaveBeenCalled();
  expect(writeUnlockRecord).not.toHaveBeenCalled();
});

test('rejects malformed PINs and short passwords before saving', async () => {
  readUnlockRecord.mockResolvedValue(null);
  await expect(setUpUnlock({ pin: '123', password: 'test-password' })).rejects.toThrow('4-digit');
  await expect(setUpUnlock({ pin: '5826', password: 'short' })).rejects.toThrow('8 and 128');
  expect(writeUnlockRecord).not.toHaveBeenCalled();
});

test('checks the chosen PIN or password verifier', async () => {
  await unlockWithSecret('pin', '5826');
  expect(matchesVerifier).toHaveBeenLastCalledWith('5826', saved().pin);
  await unlockWithSecret('password', 'test-password');
  expect(matchesVerifier).toHaveBeenLastCalledWith('test-password', saved().password);
});

test('persists failed attempts and blocks every unlock method during cooldown', async () => {
  let record = saved();
  readUnlockRecord.mockImplementation(async () => JSON.parse(JSON.stringify(record)));
  writeUnlockRecord.mockImplementation(async next => { record = JSON.parse(JSON.stringify(next)); });
  matchesVerifier.mockResolvedValue(false);
  for (let index = 0; index < 4; index += 1) {
    await expect(unlockWithSecret('pin', '000000')).rejects.toThrow('doesn’t match');
  }
  await expect(unlockWithSecret('password', 'wrong-password')).rejects.toThrow('Too many attempts');
  expect(record.failures).toBe(5);
  expect(record.lockedUntil).toBeGreaterThan(Date.now());
  record.biometricsEnabled = true;
  matchesVerifier.mockClear();
  await expect(unlockWithSecret('pin', '5826')).rejects.toThrow('Too many attempts');
  await expect(unlockWithBiometrics()).rejects.toThrow('Too many attempts');
  expect(matchesVerifier).not.toHaveBeenCalled();
  expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
  record.lockedUntil = Date.now() - 1;
  matchesVerifier.mockResolvedValue(true);
  const unlocked = await unlockWithSecret('password', 'test-password');
  expect(unlocked.failures).toBe(0);
  expect(unlocked.lockedUntil).toBe(0);
});

test('requires enrollment and explicit opt-in before using biometric unlock', async () => {
  await expect(unlockWithBiometrics()).rejects.toThrow('Enable biometrics');
  const enabled = await unlockWithSecret('pin', '5826', true);
  expect(enabled.biometricsEnabled).toBe(true);
  expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith(expect.objectContaining({
    disableDeviceFallback: true, biometricsSecurityLevel: 'strong',
  }));
  readUnlockRecord.mockResolvedValue(enabled);
  await expect(unlockWithBiometrics()).resolves.toEqual(enabled);
});

test('canceled or failed biometrics never enable or unlock the app', async () => {
  LocalAuthentication.authenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' });
  await expect(unlockWithSecret('password', 'test-password', true)).rejects.toThrow('canceled');
  expect(writeUnlockRecord).not.toHaveBeenCalled();
  readUnlockRecord.mockResolvedValue({ ...saved(), biometricsEnabled: true });
  LocalAuthentication.authenticateAsync.mockResolvedValue({ success: false, error: 'authentication_failed' });
  await expect(unlockWithBiometrics()).rejects.toThrow('not verified');
  expect(writeUnlockRecord).not.toHaveBeenCalled();
});

test('reports browser, unenrolled device, and Expo Go Face ID limitations', async () => {
  Platform.OS = 'web';
  expect((await getBiometricSupport()).available).toBe(false);
  expect(LocalAuthentication.hasHardwareAsync).not.toHaveBeenCalled();
  Platform.OS = 'ios';
  LocalAuthentication.isEnrolledAsync.mockResolvedValue(false);
  expect((await getBiometricSupport()).reason).toContain('phone settings');
  LocalAuthentication.isEnrolledAsync.mockResolvedValue(true);
  LocalAuthentication.supportedAuthenticationTypesAsync.mockResolvedValue([2]);
  Constants.executionEnvironment = 'storeClient';
  expect((await getBiometricSupport()).reason).toContain('development build');
});

test('storage failures propagate instead of reporting successful unlock', async () => {
  writeUnlockRecord.mockRejectedValue(new Error('Storage unavailable'));
  await expect(unlockWithSecret('pin', '5826')).rejects.toThrow('Storage unavailable');
});
