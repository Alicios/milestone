// DEPRECATED: this was the mock phone-identity sign-in flow (a single
// hardcoded fake patient, found by phone number). It has been superseded by
// real Supabase Auth sign-in via a one-time emailed passcode — see
// auth/PatientSession.js (requestCode/verifyCode) and components/SignInScreen.js.
// Nothing in the app imports from here anymore. Kept for now pending team
// confirmation that nobody else is mid-flight on it; slated for removal.
//
// validateProfile/formatPhone moved to auth/profileValidation.js, which is
// still real/in-use (PatientSetup's local profile completion, ProfileSettingsPanel).
import { isPossiblePhoneNumber } from 'libphonenumber-js';
import { callingCode, nationalPhoneDigits } from './phoneNumber';
import { defaultPreferences } from './preferences';

// Set true to restore completed mock setup after a full restart.
// False ignores saved data and keeps this launch entirely in memory.
export const REMEMBER_MOCK_PATIENT = false;

export const MOCK_PATIENT = {
  id: 'frank-murgolo',
  fullName: 'Frank Murgolo',
  phone: '0000000000',
  countryCallingCode: '1',
};

export function findMockPatient(phone, country = 'US') {
  const digits = nationalPhoneDigits(phone, country);
  const code = callingCode(country);
  if (code === '1' ? digits.length !== 10 : !isPossiblePhoneNumber(digits, country)) throw new Error(code === '1' ? 'Enter a 10-digit phone number.' : 'Enter a complete phone number for the selected country.');
  if (code !== '1' || digits !== MOCK_PATIENT.phone) {
    throw new Error('We could not find that number. Check it or contact your provider.');
  }
  return { ...MOCK_PATIENT };
}

export function createMockSession(patient, details) {
  return {
    profile: {
      ...patient,
      email: details.email.trim(),
      preferredName: details.preferredName.trim(),
      dateOfBirth: details.dateOfBirth.trim(),
      photoUri: details.photoUri || null,
    },
    pin: details.pinEnabled ? details.pin : null,
    preferences: defaultPreferences(),
  };
}

export function isValidMockSession(session) {
  const profile = session?.profile;
  return Boolean(profile && profile.id === MOCK_PATIENT.id &&
    profile.fullName === MOCK_PATIENT.fullName && profile.phone === MOCK_PATIENT.phone &&
    (profile.countryCallingCode === undefined || profile.countryCallingCode === MOCK_PATIENT.countryCallingCode) &&
    typeof profile.email === 'string' && typeof profile.preferredName === 'string' &&
    typeof profile.dateOfBirth === 'string' &&
    (profile.photoUri == null || (typeof profile.photoUri === 'string' && /^(data:image\/jpeg;base64,[A-Za-z0-9+/]+=*|file:\/\/.+)$/.test(profile.photoUri))) &&
    (session.pin === null || (typeof session.pin === 'string' && /^\d{4}$/.test(session.pin))));
}
