import { formatPhone, validateProfile } from '../auth/profileValidation';

test('formats phone numbers progressively', () => {
  expect(formatPhone('5551234567')).toBe('(555) 123-4567');
  expect(formatPhone('555')).toBe('555');
  expect(formatPhone('')).toBe('');
  expect(formatPhone(null)).toBe('');
});

test('accepts a blank date of birth', () => {
  expect(validateProfile({ dateOfBirth: '', pinEnabled: false })).toEqual({});
});

test.each(['02/30/2000', '13/01/2000', '1/1/2000', '01/01/3000', '02/29/2001'])('rejects invalid or future birthday %s', dateOfBirth => {
  expect(validateProfile({ dateOfBirth, pinEnabled: false })).toHaveProperty('dateOfBirth');
});

test('accepts a leap date and validates optional PIN confirmation', () => {
  expect(validateProfile({ dateOfBirth: '02/29/2000', pinEnabled: false })).toEqual({});
  expect(validateProfile({ dateOfBirth: '', pinEnabled: true, pin: '12', confirmPin: '1234' })).toHaveProperty('pin');
  expect(validateProfile({ dateOfBirth: '', pinEnabled: true, pin: '1234', confirmPin: '5678' })).toHaveProperty('confirmPin');
});
