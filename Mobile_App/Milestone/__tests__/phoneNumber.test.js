import { getLocales } from 'expo-localization';
import { callingCode, formatPhoneInput, getDevicePhoneCountry, nationalPhoneDigits, phoneCountries } from '../auth/phoneNumber';
import { findMockPatient } from '../auth/mockPatient';

jest.mock('expo-localization', () => ({ getLocales: jest.fn() }));
test('defaults to the device region independently of its language', () => {
  getLocales.mockReturnValue([{ languageTag: 'en-GB', regionCode: 'CA' }]);
  expect(getDevicePhoneCountry()).toBe('CA');
  getLocales.mockReturnValue([{ languageTag: 'en', regionCode: null }]);
  expect(getDevicePhoneCountry()).toBe('US');
  getLocales.mockReturnValue([{ regionCode: 'ZZ' }]);
  expect(getDevicePhoneCountry()).toBe('US');
  getLocales.mockImplementation(() => { throw new Error('Unavailable'); });
  expect(getDevicePhoneCountry()).toBe('US');
});
test('formats area codes and dashes while typing and deleting mock digits', () => {
  expect(formatPhoneInput('000', 'US')).toBe('000');
  expect(formatPhoneInput('0000', 'US')).toBe('(000) 0');
  expect(formatPhoneInput('0000000', 'US')).toBe('(000) 000-0');
  expect(formatPhoneInput('(000) 000-0000', 'US')).toBe('(000) 000-0000');
  expect(formatPhoneInput('(000) 000-', 'US')).toBe('(000) 000');
  expect(formatPhoneInput('abc2135550123', 'US')).toBe('(213) 555-0123');
});
test('pasted international numbers use the separately selected prefix once', () => {
  expect(formatPhoneInput('+1 (000) 000-0000', 'US')).toBe('(000) 000-0000');
  expect(nationalPhoneDigits('+44 20 7946 0018', 'GB')).toBe('2079460018');
  expect(findMockPatient('+1 (000) 000-0000').countryCallingCode).toBe('1');
});
test('formats international numbers and includes supported country codes', () => {
  expect(callingCode('GB')).toBe('44');
  expect(formatPhoneInput('02079460018', 'GB')).toBe('020 7946 0018');
  expect(phoneCountries()).toEqual(expect.arrayContaining([expect.objectContaining({ country: 'US', code: '1' }), expect.objectContaining({ country: 'GB', code: '44' })]));
  expect(() => findMockPatient('02079460018', 'GB')).toThrow('could not find');
  expect(() => findMockPatient('0000000000', 'GB')).toThrow();
});
