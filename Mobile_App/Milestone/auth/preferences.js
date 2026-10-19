export function defaultPreferences() {
  return { appearance: 'system', reminders: { enabled: false, days: [0, 1, 2, 3, 4, 5, 6], time: '09:00' } };
}

export function validReminder(reminder) {
  return Boolean(reminder && typeof reminder.enabled === 'boolean' &&
    Array.isArray(reminder.days) && reminder.days.every(day => Number.isInteger(day) && day >= 0 && day <= 6) &&
    new Set(reminder.days).size === reminder.days.length &&
    (!reminder.enabled || reminder.days.length > 0) && /^([01]\d|2[0-3]):[0-5]\d$/.test(reminder.time));
}

export function normalizePreferences(preferences) {
  const defaults = defaultPreferences();
  return {
    appearance: ['light', 'dark', 'system'].includes(preferences?.appearance) ? preferences.appearance : defaults.appearance,
    reminders: validReminder(preferences?.reminders) ? { ...preferences.reminders, days: [...preferences.reminders.days] } : defaults.reminders,
  };
}
