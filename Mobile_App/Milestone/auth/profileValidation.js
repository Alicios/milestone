// Generic, patient-identity-agnostic validation/formatting helpers. Used by
// PatientSetup (first-time local profile completion) and ProfileSettingsPanel
// (later edits). Extracted out of mockPatient.js, which now only holds the
// deprecated mock phone-identity flow.

export function formatPhone(phone) {
  const digits = (phone || '').replace(/\D/g, '').slice(0, 10);
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function validateProfile({ dateOfBirth = '', pinEnabled, pin, confirmPin }, today = new Date()) {
  const errors = {};
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
