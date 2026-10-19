import { getLocales } from 'expo-localization';
import { AsYouType, getCountries, getCountryCallingCode } from 'libphonenumber-js';

const supportedCountries = getCountries();

// Device region settings only; no location permission or geolocation request.
export function getDevicePhoneCountry() {
  try {
    const region = getLocales()[0]?.regionCode?.toUpperCase();
    return supportedCountries.includes(region) ? region : 'US';
  } catch {
    return 'US';
  }
}

export function callingCode(country) {
  return getCountryCallingCode(country);
}

export function nationalPhoneDigits(value, country) {
  const digits = value.replace(/\D/g, '');
  const prefix = callingCode(country);
  return value.trim().startsWith('+') && digits.startsWith(prefix)
    ? digits.slice(prefix.length)
    : digits;
}

export function formatPhoneInput(value, country) {
  const digits = nationalPhoneDigits(value, country).slice(0, 15);
  // Keep the requested area-code/dash format, including Frank's mock zeros.
  if (callingCode(country) === '1' && digits.length <= 10) {
    if (digits.length < 4) return digits;
    if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return new AsYouType(country).input(digits);
}

export function phoneCountries() {
  let names;
  try {
    names = new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    // Older native engines can still display and search ISO country codes.
  }
  return supportedCountries.map(country => ({
    country,
    name: names?.of(country) || country,
    code: callingCode(country),
  })).sort((a, b) => a.name.localeCompare(b.name));
}
