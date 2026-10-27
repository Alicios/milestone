import { createPatientSession, isValidPatientSession, validateProfile } from '../auth/patientAccount';

const patient = { id: 'auth-user', databasePatientId: 'patient-uuid', fullName: 'Patient', phone: '', email: 'patient@example.com' };
test('creates local preferences bound to a verified account without sample identity defaults', () => {
  const session = createPatientSession(patient);
  expect(session.profile).toMatchObject(patient);
  expect(session.pin).toBeNull();
  expect(isValidPatientSession(session)).toBe(true);
  expect(isValidPatientSession({ ...session, profile: { ...session.profile, id: '' } })).toBe(false);
  expect(isValidPatientSession({ ...session, pin: '12' })).toBe(false);
});
test('validates optional birthday and PIN', () => {
  expect(validateProfile({ dateOfBirth: '02/30/2000' })).toHaveProperty('dateOfBirth');
  expect(validateProfile({ dateOfBirth: '02/29/2000' })).toEqual({});
  expect(validateProfile({ pinEnabled: true, pin: '1234', confirmPin: '1235' })).toHaveProperty('confirmPin');
});
