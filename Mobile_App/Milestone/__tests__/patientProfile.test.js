import { fetchSharedPatientProfile } from '../lib/patientProfile';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { from: jest.fn() } }));

function query(data, error = null) {
  const builder = { select: jest.fn(), eq: jest.fn(), single: jest.fn(async () => ({ data, error })) };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  supabase.from.mockReturnValue(builder);
  return builder;
}

test('uses the stable database UUID even when the phone has changed or been cleared', async () => {
  const builder = query({ id: 'stable-patient', name: 'Updated name', email: 'updated@example.com', phone: null, care_status: 'pending' });
  const profile = await fetchSharedPatientProfile({ databasePatientId: 'stable-patient', phone: 'old-phone' });
  expect(builder.eq).toHaveBeenCalledWith('id', 'stable-patient');
  expect(profile).toEqual({ databasePatientId: 'stable-patient', fullName: 'Updated name', email: 'updated@example.com', phone: '', primaryConcern: '', treatmentFocus: '', startOfCare: '', careStatus: 'pending' });
  expect(builder.select.mock.calls[0][0]).not.toMatch(/pending_otp|auth_user_id/);
});

test('initial phone lookup resolves a database UUID and errors do not produce blank defaults', async () => {
  const builder = query({ id: 'resolved-patient', name: 'Patient' });
  expect((await fetchSharedPatientProfile({ phone: '0000000000' })).databasePatientId).toBe('resolved-patient');
  expect(builder.eq).toHaveBeenCalledWith('phone', '0000000000');
  const failure = new Error('offline');
  query(null, failure);
  await expect(fetchSharedPatientProfile({ databasePatientId: 'resolved-patient' })).rejects.toBe(failure);
});
