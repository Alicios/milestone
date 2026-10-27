import { createMockSession, findMockPatient, isValidMockSession, MOCK_PATIENT } from '../auth/mockPatient';
jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ regionCode: 'US' }]) }));
const details = { email: 'frank@example.com', preferredName: 'Frankie', dateOfBirth: '', pinEnabled: false };
test('accepts formatted numbers and rejects unmatched or incomplete numbers', () => {
  expect(findMockPatient('(000) 000- 0000')).toEqual(MOCK_PATIENT);
  expect(() => findMockPatient('000')).toThrow('10-digit'); expect(() => findMockPatient('1234567890')).toThrow('could not find');
});
test('normalizes profile values and rejects malformed saved sessions', () => {
  const session = createMockSession(MOCK_PATIENT, { ...details, email: ' frank@example.com ' });
  expect(session.profile.email).toBe('frank@example.com'); expect(session.pin).toBeNull(); expect(isValidMockSession(session)).toBe(true);
  expect(isValidMockSession({ ...session, pin: '12' })).toBe(false); expect(isValidMockSession({ profile: null })).toBe(false);
  expect(isValidMockSession({ ...session, pin: 1234 })).toBe(false);
});
