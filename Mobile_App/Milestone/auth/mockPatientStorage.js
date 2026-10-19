import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { File, Paths } from 'expo-file-system';
import { isValidMockSession } from './mockPatient';

const STORAGE_KEY = 'milestone.mock-patient.v1';

export async function loadMockSession() {
  try {
    const value = Platform.OS === 'web'
      ? global.localStorage?.getItem(STORAGE_KEY)
      : await SecureStore.getItemAsync(STORAGE_KEY);
    const session = value ? JSON.parse(value) : null;
    if (!isValidMockSession(session)) return null;
    if (Platform.OS !== 'web' && session.profile.photoUri?.startsWith('file://')) {
      const photo = new File(Paths.document, 'milestone-profile-photo.jpg');
      session.profile.photoUri = photo.exists ? photo.uri : null;
    }
    return session;
  } catch {
    return null;
  }
}

export async function saveMockSession(session) {
  try {
    if (Platform.OS === 'web') {
      if (!global.localStorage) return false;
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      // Store the image in app documents, keeping large image data out of SecureStore.
      const storedSession = { ...session, profile: { ...session.profile } };
      if (session.profile.photoUri?.startsWith('data:image/jpeg;base64,')) {
        const photo = new File(Paths.document, 'milestone-profile-photo.jpg');
        photo.write(session.profile.photoUri.split(',')[1], { encoding: 'base64' });
        storedSession.profile.photoUri = photo.uri;
      }
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(storedSession));
    }
    return true;
  } catch {
    return false;
  }
}
