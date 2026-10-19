import { createMockSession, findMockPatient, isValidMockSession, MOCK_PATIENT, validateProfile } from '../auth/mockPatient';
jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ regionCode: 'US' }]) }));
const details = { email: 'frank@example.com', preferredName: 'Frankie', dateOfBirth: '', pinEnabled: false };
test('accepts formatted numbers and rejects unmatched or incomplete numbers', () => {
  expect(findMockPatient('(000) 000- 0000')).toEqual(MOCK_PATIENT);
  expect(() => findMockPatient('000')).toThrow('10-digit'); expect(() => findMockPatient('1234567890')).toThrow('could not find');
});
test('requires valid email but accepts empty optional fields', () => {
  expect(validateProfile(details)).toEqual({}); expect(validateProfile({ ...details, email: 'bad' })).toHaveProperty('email');
});
test.each(['02/30/2000', '13/01/2000', '1/1/2000', '01/01/3000', '02/29/2001'])('rejects invalid or future birthday %s', dateOfBirth => {
  expect(validateProfile({ ...details, dateOfBirth })).toHaveProperty('dateOfBirth');
});
test('accepts a leap date and validates optional PIN confirmation', () => {
  expect(validateProfile({ ...details, dateOfBirth: '02/29/2000' })).toEqual({});
  expect(validateProfile({ ...details, pinEnabled: true, pin: '12', confirmPin: '1234' })).toHaveProperty('pin');
  expect(validateProfile({ ...details, pinEnabled: true, pin: '1234', confirmPin: '5678' })).toHaveProperty('confirmPin');
});
test('normalizes profile values and rejects malformed saved sessions', () => {
  const session = createMockSession(MOCK_PATIENT, { ...details, email: ' frank@example.com ' });
  expect(session.profile.email).toBe('frank@example.com'); expect(session.pin).toBeNull(); expect(isValidMockSession(session)).toBe(true);
  expect(isValidMockSession({ ...session, pin: '12' })).toBe(false); expect(isValidMockSession({ profile: null })).toBe(false);
  expect(isValidMockSession({ ...session, pin: 1234 })).toBe(false);
});
