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

export function formatPhone(phone) {
  const digits = phone.replace(/\D/g, '').slice(0, 10);
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function validateProfile({ email, dateOfBirth = '', pinEnabled, pin, confirmPin }, today = new Date()) {
  const errors = {};
  if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (dateOfBirth.trim()) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateOfBirth.trim());
    const month = Number(match?.[1]);
    const day = Number(match?.[2]);
    const year = Number(match?.[3]);
    const date = new Date(year, month - 1, day);
    if (!match || year < 1900 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      errors.dateOfBirth = 'Enter a valid date as MM/DD/YYYY.';
    } else if (date > today) {
      errors.dateOfBirth = 'Date of birth cannot be in the future.';
    }
  }
  if (pinEnabled) {
    if (!/^\d{4}$/.test(pin ?? '')) errors.pin = 'Choose a 4-digit PIN.';
    if (confirmPin !== pin || !confirmPin) errors.confirmPin = 'Your PINs must match.';
  }
  return errors;
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
    (session.pin === null || (typeof session.pin === 'string' && /^\d{4}$/.test(session.pin))) &&
    Object.keys(validateProfile({ ...profile, pinEnabled: false })).length === 0);
}
