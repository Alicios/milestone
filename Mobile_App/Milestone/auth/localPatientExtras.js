// Replaces mockPatientStorage.js. Same SecureStore/localStorage + photo
// mechanics, but scoped per authenticated patient id instead of one global
// key — without this, a second patient signing in on the same shared/demo
// device would see the first patient's cached PIN/photo/preferences. Only
// local-only conveniences live here now (PIN, cached photo, preferred name,
// date of birth, appearance/reminder preferences) — core identity (name,
// email, phone) comes from the real backend via lib/patientApi.js.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { File, Paths } from 'expo-file-system';
import { normalizePreferences } from './preferences';

const KEY_PREFIX = 'milestone.patient-local.v1.';

function keyFor(patientId) {
  return `${KEY_PREFIX}${patientId}`;
}

function isValidLocalExtras(extras) {
  return Boolean(extras && typeof extras === 'object' &&
    typeof extras.preferredName === 'string' &&
    typeof extras.dateOfBirth === 'string' &&
    (extras.photoUri == null || (typeof extras.photoUri === 'string' && /^(data:image\/jpeg;base64,[A-Za-z0-9+/]+=*|file:\/\/.+)$/.test(extras.photoUri))) &&
    (extras.pin === null || (typeof extras.pin === 'string' && /^\d{4}$/.test(extras.pin))));
}

export async function loadLocalExtras(patientId) {
  try {
    const value = Platform.OS === 'web'
      ? global.localStorage?.getItem(keyFor(patientId))
      : await SecureStore.getItemAsync(keyFor(patientId));
    const extras = value ? JSON.parse(value) : null;
    if (!isValidLocalExtras(extras)) return null;
    if (Platform.OS !== 'web' && extras.photoUri?.startsWith('file://')) {
      const photo = new File(Paths.document, `milestone-profile-photo-${patientId}.jpg`);
      extras.photoUri = photo.exists ? photo.uri : null;
    }
    return { ...extras, preferences: normalizePreferences(extras.preferences) };
  } catch {
    return null;
  }
}

export async function saveLocalExtras(patientId, extras) {
  try {
    if (Platform.OS === 'web') {
      if (!global.localStorage) return false;
      global.localStorage.setItem(keyFor(patientId), JSON.stringify(extras));
    } else {
      // Store the image in app documents, keeping large image data out of SecureStore.
      const stored = { ...extras };
      if (extras.photoUri?.startsWith('data:image/jpeg;base64,')) {
        const photo = new File(Paths.document, `milestone-profile-photo-${patientId}.jpg`);
        photo.write(extras.photoUri.split(',')[1], { encoding: 'base64' });
        stored.photoUri = photo.uri;
      }
      await SecureStore.setItemAsync(keyFor(patientId), JSON.stringify(stored));
    }
    return true;
  } catch {
    return false;
  }
}
