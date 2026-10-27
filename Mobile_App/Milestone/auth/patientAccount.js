import { defaultPreferences } from './preferences';

export function validateProfile({ email = '', dateOfBirth = '', pinEnabled, pin, confirmPin }, today = new Date()) {
  const errors = {};
  if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (dateOfBirth.trim()) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateOfBirth.trim());
    const month = Number(match?.[1]), day = Number(match?.[2]), year = Number(match?.[3]);
    const date = new Date(year, month - 1, day);
    if (!match || year < 1900 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) errors.dateOfBirth = 'Enter a valid date as MM/DD/YYYY.';
    else if (date > today) errors.dateOfBirth = 'Date of birth cannot be in the future.';
  }
  if (pinEnabled) {
    if (!/^\d{4}$/.test(pin ?? '')) errors.pin = 'Choose a 4-digit PIN.';
    if (confirmPin !== pin || !confirmPin) errors.confirmPin = 'Your PINs must match.';
  }
  return errors;
}

export function createPatientSession(patient, details = {}) {
  return {
    profile: { ...patient, preferredName: (details.preferredName || '').trim(), dateOfBirth: (details.dateOfBirth || '').trim(), photoUri: details.photoUri || null },
    pin: details.pinEnabled ? details.pin : null,
    preferences: defaultPreferences(),
  };
}

export function isValidPatientSession(session) {
  const p = session?.profile;
  return Boolean(p && typeof p.id === 'string' && p.id && typeof p.databasePatientId === 'string' && p.databasePatientId &&
    typeof p.fullName === 'string' && p.fullName.trim() && typeof p.phone === 'string' && typeof p.email === 'string' &&
    typeof p.preferredName === 'string' && typeof p.dateOfBirth === 'string' &&
    (p.photoUri == null || (typeof p.photoUri === 'string' && /^(data:image\/jpeg;base64,[A-Za-z0-9+/]+=*|file:\/\/.+)$/.test(p.photoUri))) &&
    (session.pin === null || (typeof session.pin === 'string' && /^\d{4}$/.test(session.pin))) &&
    Object.keys(validateProfile({ ...p, pinEnabled: false })).length === 0);
}
