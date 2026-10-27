import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/modules.mjs'

const valid = { name: ' Patient ', email: ' person@example.com ', phone: '+1 (202) 555-0100', primaryConcern: ' Concern ', treatmentFocus: ' Focus ', startOfCare: '2026-10-26', careStatus: 'active' }
function harness(result = { data: { id: 'patient', name: 'Patient' }, error: null }) {
  const calls = []
  const supabase = { rpc(name, args) { calls.push({ name, args }); return { single: async () => result } } }
  return { ...loadTs('src/lib/supabaseData.ts', { './supabase': { supabase } }), calls }
}
test('validates dates, contact values, name, and care status before writing', async () => {
  const api = harness()
  for (const patch of [{ name: ' ' }, { email: 'bad' }, { phone: '123' }, { phone: 'call 2025550100' }, { startOfCare: '2026-02-30' }, { startOfCare: 'not-a-date' }, { careStatus: 'other' }]) {
    await assert.rejects(api.updatePatientDetails('patient', { ...valid, ...patch }))
  }
  assert.equal(api.calls.length, 0)
})
test('uses the returned row and saves blank optional fields as null', async () => {
  const api = harness()
  assert.deepEqual(await api.updatePatientDetails('patient', { ...valid, email: ' ', phone: '', primaryConcern: '', treatmentFocus: '', startOfCare: '' }), { id: 'patient', name: 'Patient' })
  assert.deepEqual(api.calls, [{ name: 'update_patient_details', args: { p_patient_id: 'patient', p_name: 'Patient', p_email: null, p_phone: null, p_primary_concern: null, p_treatment_focus: null, p_start_of_care: null, p_care_status: 'active' } }])
})
test('preserves database authorization and save errors', async () => {
  const failure = { code: '42501', message: 'Active relationship required' }
  const api = harness({ data: null, error: failure })
  await assert.rejects(api.updatePatientDetails('patient', valid), error => error === failure)
  assert.equal(api.calls.length, 1)
})
