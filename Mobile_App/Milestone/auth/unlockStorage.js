import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const key = 'milestone.device-unlock.v1';

export async function readUnlockRecord() {
  const value = Platform.OS === 'web'
    ? window.localStorage.getItem(key)
    : await SecureStore.getItemAsync(key);
  if (value === null) return null;

  const record = JSON.parse(value);
  if (
    record.version !== 1 ||
    ![record.pin, record.password].every(item =>
      item && /^[a-f0-9]{32}$/.test(item.salt) && /^[a-f0-9]{64}$/.test(item.hash)
    ) ||
    !Number.isInteger(record.failures) || record.failures < 0 ||
    !Number.isFinite(record.lockedUntil) || record.lockedUntil < 0 ||
    typeof record.biometricsEnabled !== 'boolean'
  ) {
    throw new Error('Your saved unlock settings could not be read. Please try again.');
  }
  return record;
}

export async function writeUnlockRecord(record) {
  const value = JSON.stringify(record);
  if (Platform.OS === 'web') {
    window.localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
}
