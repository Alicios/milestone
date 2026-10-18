import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import { createVerifier, matchesVerifier } from './passwordHash';
import { readUnlockRecord, writeUnlockRecord } from './unlockStorage';

export { readUnlockRecord } from './unlockStorage';

export async function getBiometricSupport() {
  if (Platform.OS === 'web') {
    return { available: false, label: 'Face or fingerprint', reason: 'Use the phone app for face or fingerprint unlock.' };
  }
  try {
    const [hardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    const fingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
    if (Platform.OS === 'ios' && face && !fingerprint && Constants.executionEnvironment === 'storeClient') {
      return { available: false, label: 'Face unlock', reason: 'Face ID needs a Milestone development build on iPhone. Use your PIN or password in Expo Go.' };
    }
    return {
      available: hardware && enrolled,
      label: face && fingerprint ? 'Face or fingerprint' : face ? 'Face unlock' : 'Fingerprint',
      reason: !hardware
        ? 'This device does not support biometric unlock.'
        : !enrolled ? 'Set up face or fingerprint unlock in your phone settings first.' : '',
    };
  } catch {
    return { available: false, label: 'Face or fingerprint', reason: 'Biometric unlock is unavailable. Use your PIN or password.' };
  }
}

function checkCooldown(record) {
  if (record.lockedUntil > Date.now()) {
    throw new Error(`Too many attempts. Try again in ${Math.ceil((record.lockedUntil - Date.now()) / 1000)} seconds.`);
  }
}

export async function authenticateBiometric() {
  const support = await getBiometricSupport();
  if (!support.available) throw new Error(support.reason);
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock Milestone',
    cancelLabel: 'Use PIN or password',
    disableDeviceFallback: true,
    fallbackLabel: '',
    biometricsSecurityLevel: 'strong',
  });
  if (!result.success) {
    const canceled = ['user_cancel', 'app_cancel', 'system_cancel', 'user_fallback'].includes(result.error);
    throw new Error(canceled
      ? 'Unlock canceled. You can use your PIN or password.'
      : 'Your face or fingerprint was not verified. Try again or use your PIN or password.');
  }
}

export async function setUpUnlock({ pin, password, enableBiometrics = false }) {
  if (await readUnlockRecord()) throw new Error('Unlock is already set up on this device.');
  if (!/^\d{6}$/.test(pin)) throw new Error('Choose a 6-digit PIN.');
  if (password.length < 8 || password.length > 128 || !password.trim()) {
    throw new Error('Choose a password between 8 and 128 characters.');
  }
  if (enableBiometrics) await authenticateBiometric();
  const record = {
    version: 1,
    pin: await createVerifier(pin),
    password: await createVerifier(password),
    biometricsEnabled: enableBiometrics,
    failures: 0,
    lockedUntil: 0,
  };
  await writeUnlockRecord(record);
  return record;
}

export async function unlockWithSecret(method, secret, enableBiometrics = false) {
  const record = await readUnlockRecord();
  if (!record) throw new Error('Set up your PIN and password first.');
  if (!['pin', 'password'].includes(method)) throw new Error('Choose PIN or password.');
  checkCooldown(record);
  if (!await matchesVerifier(secret, record[method])) {
    record.failures += 1;
    if (record.failures >= 5) {
      record.lockedUntil = Date.now() + Math.min(900000, 30000 * 2 ** (record.failures - 5));
    }
    await writeUnlockRecord(record);
    checkCooldown(record);
    throw new Error(`That ${method === 'pin' ? 'PIN' : 'password'} doesn’t match. Please try again.`);
  }
  if (enableBiometrics && !record.biometricsEnabled) {
    await authenticateBiometric();
    record.biometricsEnabled = true;
  }
  record.failures = 0;
  record.lockedUntil = 0;
  await writeUnlockRecord(record);
  return record;
}

export async function unlockWithBiometrics() {
  const record = await readUnlockRecord();
  if (!record?.biometricsEnabled) throw new Error('Enable biometrics using your PIN or password first.');
  checkCooldown(record);
  await authenticateBiometric();
  record.failures = 0;
  record.lockedUntil = 0;
  await writeUnlockRecord(record);
  return record;
}
