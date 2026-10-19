import { defaultPreferences, normalizePreferences, validReminder } from '../auth/preferences';
import { resolveAppearance, themeColor } from '../components/AppTheme';

test('old or malformed preferences receive safe defaults', () => {
  expect(normalizePreferences()).toEqual(defaultPreferences());
  expect(normalizePreferences({ appearance: 'invalid', reminders: { enabled: true, days: [], time: '25:00' } })).toEqual(defaultPreferences());
  expect(validReminder({ enabled: true, days: [1, 3, 5], time: '09:00' })).toBe(true);
  expect(validReminder({ enabled: true, days: [1, 1], time: '09:00' })).toBe(false);
});
test('explicit appearance overrides the device and system follows changes', () => {
  expect(resolveAppearance('system', 'dark')).toBe('dark'); expect(resolveAppearance('system', 'light')).toBe('light');
  expect(resolveAppearance('light', 'dark')).toBe('light'); expect(resolveAppearance('dark', 'light')).toBe('dark');
});
test('dark style mapping distinguishes backgrounds from text', () => {
  const colors = { surface: 'surface', text: 'text', onAccent: 'onAccent', border: 'border' };
  expect(themeColor('#FFFDF7', 'backgroundColor', colors)).toBe('surface');
  expect(themeColor('#FFFDF7', 'color', colors)).toBe('onAccent');
  expect(themeColor('#193333', 'color', colors)).toBe('text');
  expect(themeColor('#193333', 'borderColor', colors)).toBe('border');
});
