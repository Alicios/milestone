export type Appointment = {
  id: string; provider_id: string; patient_profile_id: string;
  starts_at: string; ends_at: string; location: string; status: 'scheduled' | 'cancelled';
};

// Interpret the form in the device's displayed timezone, then persist UTC.
export function appointmentTimes(date: string, time: string, duration: string, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Enter a date as YYYY-MM-DD and time as HH:MM (24-hour).');
  const start = new Date(`${date}T${time}:00`);
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if (!Number.isFinite(start.getTime()) || start.getFullYear() !== year || start.getMonth() + 1 !== month || start.getDate() !== day || start.getHours() !== hour || start.getMinutes() !== minute) throw new Error('Enter a valid date and time in your timezone.');
  if (start.getTime() <= now) throw new Error('Choose a future appointment time.');
  if (!/^\d+$/.test(duration) || Number(duration) < 5 || Number(duration) > 480) throw new Error('Enter a duration between 5 and 480 minutes.');
  return { starts_at: start.toISOString(), ends_at: new Date(start.getTime() + Number(duration) * 60000).toISOString() };
}
export function appointmentError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === '23P01') return 'This appointment overlaps another visit. Choose another time.';
  if (code === '42501') return 'This appointment could not be saved. Refresh and choose an active patient and future time.';
  return 'Could not save the appointment. Check your connection and retry the same booking.';
}
