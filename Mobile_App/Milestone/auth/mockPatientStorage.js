import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { isValidMockSession } from './mockPatient';

const STORAGE_KEY = 'milestone.mock-patient.v1';

export async function loadMockSession() {
  try {
    const value = Platform.OS === 'web'
      ? global.localStorage?.getItem(STORAGE_KEY)
      : await SecureStore.getItemAsync(STORAGE_KEY);
    const session = value ? JSON.parse(value) : null;
    return isValidMockSession(session) ? session : null;
  } catch {
    return null;
  }
}

export async function saveMockSession(session) {
  try {
    const value = JSON.stringify(session);
    if (Platform.OS === 'web') {
      if (!global.localStorage) return false;
      global.localStorage.setItem(STORAGE_KEY, value);
    } else {
      await SecureStore.setItemAsync(STORAGE_KEY, value);
    }
    return true;
  } catch {
    return false;
  }
}
