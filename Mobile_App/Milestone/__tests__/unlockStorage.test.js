import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { readUnlockRecord, writeUnlockRecord } from '../auth/unlockStorage';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(), setItemAsync: jest.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
}));

const record = { version: 1, pin: { salt: 'a'.repeat(32), hash: 'b'.repeat(64) }, password: { salt: 'c'.repeat(32), hash: 'd'.repeat(64) }, failures: 0, lockedUntil: 0, biometricsEnabled: false };

beforeEach(() => { jest.clearAllMocks(); Platform.OS = 'ios'; });

test('stores native verifiers in device-only secure storage', async () => {
  await writeUnlockRecord(record);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('milestone.device-unlock.v1', JSON.stringify(record), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(record));
  expect(await readUnlockRecord()).toEqual(record);
});

test('treats missing credentials as setup and corrupted credentials as an error', async () => {
  SecureStore.getItemAsync.mockResolvedValue(null);
  expect(await readUnlockRecord()).toBe(null);
  SecureStore.getItemAsync.mockResolvedValue(JSON.stringify({ version: 1 }));
  await expect(readUnlockRecord()).rejects.toThrow('could not be read');
  SecureStore.getItemAsync.mockResolvedValue('invalid-json');
  await expect(readUnlockRecord()).rejects.toThrow();
});
