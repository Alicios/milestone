import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { File, Paths } from 'expo-file-system';
import { isValidPatientSession } from './patientAccount';
import { normalizePreferences } from './preferences';

const photoName = userId => 'milestone-profile-' + userId.replace(/[^a-zA-Z0-9-]/g, '_') + '.jpg';
const storageKey = userId => 'milestone.patient.v2.' + userId;

export async function loadPatientSession(userId) {
  try {
    const value = Platform.OS === 'web'
      ? global.localStorage?.getItem(storageKey(userId))
      : await SecureStore.getItemAsync(storageKey(userId));
    const session = value ? JSON.parse(value) : null;
    if (!isValidPatientSession(session) || session.profile.id !== userId) return null;
    if (Platform.OS !== 'web' && session.profile.photoUri?.startsWith('file://')) {
      const photo = new File(Paths.document, photoName(session.profile.id));
      session.profile.photoUri = photo.exists ? photo.uri : null;
    }
    return { ...session, preferences: normalizePreferences(session.preferences) };
  } catch {
    return null;
  }
}

export async function savePatientSession(session) {
  try {
    if (Platform.OS === 'web') {
      if (!global.localStorage) return false;
      global.localStorage.setItem(storageKey(session.profile.id), JSON.stringify(session));
    } else {
      // Store the image in app documents, keeping large image data out of SecureStore.
      const storedSession = { ...session, profile: { ...session.profile } };
      if (session.profile.photoUri?.startsWith('data:image/jpeg;base64,')) {
        const photo = new File(Paths.document, photoName(session.profile.id));
        photo.write(session.profile.photoUri.split(',')[1], { encoding: 'base64' });
        storedSession.profile.photoUri = photo.uri;
      }
      await SecureStore.setItemAsync(storageKey(session.profile.id), JSON.stringify(storedSession));
    }
    return true;
  } catch {
    return false;
  }
}

