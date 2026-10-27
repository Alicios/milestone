import { isSupabaseConfigured, supabase } from './supabase';

export async function fetchSharedPatientProfile() {
  if (!isSupabaseConfigured) throw new Error('Patient details are unavailable. Please try again.');
  const { data: rows, error } = await supabase.rpc('get_my_patient_profile');
  if (error) throw error;
  const data = rows?.[0];
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
