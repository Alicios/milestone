import { fetchSharedPatientProfile } from '../lib/patientProfile';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc: jest.fn() } }));

function query(data, error = null) {
  supabase.rpc.mockResolvedValue({ data: data ? [data] : [], error });
}

test('uses the stable database UUID even when the phone has changed or been cleared', async () => {
  query({ id: 'stable-patient', name: 'Updated name', email: 'updated@example.com', phone: null, care_status: 'pending' });
  const profile = await fetchSharedPatientProfile({ databasePatientId: 'stable-patient', phone: 'old-phone' });
  expect(supabase.rpc).toHaveBeenCalledWith('get_my_patient_profile');
  expect(profile).toEqual({ databasePatientId: 'stable-patient', fullName: 'Updated name', email: 'updated@example.com', phone: '', primaryConcern: '', treatmentFocus: '', startOfCare: '', careStatus: 'pending' });
});

test('uses the authenticated profile and propagates errors instead of trusting a client patient ID', async () => {
  query({ id: 'resolved-patient', name: 'Patient' });
  expect((await fetchSharedPatientProfile({ phone: '0000000000' })).databasePatientId).toBe('resolved-patient');
  expect(supabase.rpc).toHaveBeenCalledWith('get_my_patient_profile');
  const failure = new Error('offline');
  query(null, failure);
  await expect(fetchSharedPatientProfile({ databasePatientId: 'resolved-patient' })).rejects.toBe(failure);
});
