import { isSupabaseConfigured, supabase } from './supabase';

export async function fetchSharedPatientProfile(profile) {
  if (!isSupabaseConfigured) throw new Error('Patient details are unavailable. Please try again.');
  let query = supabase.from('patients')
    .select('id, name, email, phone, primary_concern, treatment_focus, start_of_care, care_status');
  query = profile.databasePatientId
    ? query.eq('id', profile.databasePatientId)
    : query.eq('phone', profile.phone);
  const { data, error } = await query.single();
  if (error) throw error;
  if (!data?.id) throw new Error('Your patient record could not be found.');
  return {
    databasePatientId: data.id,
    fullName: data.name,
    email: data.email ?? '',
    phone: data.phone ?? '',
    primaryConcern: data.primary_concern ?? '',
    treatmentFocus: data.treatment_focus ?? '',
    startOfCare: data.start_of_care ?? '',
    careStatus: data.care_status,
  };
}
