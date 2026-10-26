import { defaultPreferences } from './preferences';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

function makePatientSession(user, patient) {
  if (!patient) return null;
  return {
    isPatientAccount: true,
    profile: {
      id: patient.id,
      accountUserId: user.id,
      fullName: patient.name,
      phone: patient.phone || '',
      countryCallingCode: '1',
      email: patient.email || user.email || '',
      preferredName: '',
      dateOfBirth: '',
      photoUri: null,
    },
    pin: null,
    preferences: defaultPreferences(),
  };
}

export async function restorePatientAccountSession() {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.user) return null;

  const { data, error } = await supabase.rpc('get_my_patient_profile');
  if (error) return null;
  const patient = Array.isArray(data) ? data[0] : data;
  if (!patient) {
    await supabase.auth.signOut();
    return null;
  }
  return makePatientSession(session.user, patient);
}

export async function signInPatientAccount(email, password) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Patient accounts are not configured on this app yet.');
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  if (!data.user) throw new Error('Sign-in did not return a patient account.');

  const patientSession = await restorePatientAccountSession();
  if (!patientSession) {
    await supabase.auth.signOut();
    throw new Error('No patient profile is linked to this account. Ask your provider to invite you to Milestone.');
  }
  return patientSession;
}
