// Real Auth/API integration against disposable synthetic accounts. When mail is
// configured, the endpoint attempts delivery to these synthetic addresses too.
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local and npm run dev on port 3000.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { loadEnv } from 'vite'
import { createClient } from '@supabase/supabase-js'

const env = loadEnv('development', process.cwd(), '')
const url = env.VITE_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
const publicKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY
if (!url || !key || !publicKey) {
  console.error('Missing local server credentials. Configure SUPABASE_SERVICE_ROLE_KEY in .env.local; do not print or share it.')
  process.exit(2)
}
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin = createClient(url, key, options)
const provider = createClient(url, publicKey, options)
const patient = createClient(url, publicKey, options)
const suffix = randomUUID()
const providerEmail = `onboarding-provider-${suffix}@example.invalid`
const wrongEmail = `onboarding-wrong-${suffix}@example.invalid`
const correctEmail = `onboarding-correct-${suffix}@example.invalid`
let providerId, patientId, patientAuthId
let bearer
function checked(result) {
  if (result.error) throw Error(`Supabase operation failed (${result.error.code || result.error.status || 'unknown'})`)
  return result.data
}
async function post(path, body) {
  const response = await fetch(`http://127.0.0.1:3000/api/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` }, body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}
async function login(email, otp) {
  for (const type of ['magiclink', 'email', 'signup']) {
    const result = await patient.auth.verifyOtp({ email, token: otp, type })
    if (!result.error) return result.data.session
  }
  return null
}
try {
  const password = `${randomUUID()}Aa1!`
  const practice = checked(await admin.from('medical_practices').select('id').limit(1))[0]
  assert.ok(practice?.id, 'An existing medical practice is required for the synthetic provider')
  providerId = checked(await admin.auth.admin.createUser({ email: providerEmail, password, email_confirm: true,
    user_metadata: { name: 'Synthetic onboarding verification provider', medical_practice_id: practice.id } })).user.id
  bearer = checked(await provider.auth.signInWithPassword({ email: providerEmail, password })).session.access_token
  patientId = checked(await provider.rpc('create_patient', { patient_name: 'Synthetic onboarding verification patient', patient_phone: null, patient_email: wrongEmail }))
  const firstCode = await post('invite-patient', { patientId })
  assert.equal(firstCode.status, 200, 'Initial code generation failed')
  patientAuthId = checked(await admin.from('patients').select('auth_user_id').eq('id', patientId).single()).auth_user_id
  const nameSave = await post('update-patient-onboarding', { patientId, name: 'Corrected synthetic name', email: wrongEmail })
  assert.equal(nameSave.status, 200)
  assert.equal(checked(await admin.from('patients').select('pending_otp_code').eq('id', patientId).single()).pending_otp_code, firstCode.body.otp)
  const conflict = await post('update-patient-onboarding', { patientId, name: 'Corrected synthetic name', email: providerEmail })
  assert.equal(conflict.status, 409); assert.equal(conflict.body.error.code, 'EMAIL_CONFLICT')
  const correction = await post('update-patient-onboarding', { patientId, name: 'Corrected synthetic name', email: correctEmail })
  assert.equal(correction.status, 200)
  const stored = checked(await admin.from('patients').select('id,email,pending_otp_code').eq('id', patientId).single())
  assert.equal(stored.email, correctEmail); assert.equal(stored.pending_otp_code, null)
  assert.equal(checked(await admin.auth.admin.getUserById(patientAuthId)).user.email, correctEmail)
  assert.equal(await login(wrongEmail, firstCode.body.otp), null, 'Previous address accepted the old code')
  assert.equal(await login(correctEmail, firstCode.body.otp), null, 'Corrected address accepted the old code')
  const newCode = await post('invite-patient', { patientId })
  assert.equal(newCode.status, 200)
  assert.ok(await login(correctEmail, newCode.body.otp), 'New code did not sign in at the corrected address')
  const statuses = checked(await provider.rpc('get_patient_onboarding_statuses'))
  assert.equal(statuses.some(row => row.patient_id === patientId), false)
  const completed = await post('update-patient-onboarding', { patientId, name: 'Unexpected change', email: correctEmail })
  assert.equal(completed.status, 409); assert.equal(completed.body.error.code, 'SETUP_COMPLETE')
  console.log('PASS: real Auth email correction, collision rejection, old-code rejection, new-code sign-in and completed-setup protection.')
} catch (error) {
  // No API payloads, account emails, codes, keys or sessions are logged.
  console.error('FAIL: Live onboarding verification did not complete. No account, code, session or key payloads are logged.')
  process.exitCode = 1
} finally {
  const cleanupFailures = []
  for (const client of [patient, provider]) {
    try { checked(await client.auth.signOut()) } catch { cleanupFailures.push('session sign-out') }
  }
  if (patientId) {
    // A creation response may have been lost after the Auth account was linked.
    if (!patientAuthId) {
      try { patientAuthId = checked(await admin.from('patients').select('auth_user_id').eq('id', patientId).single()).auth_user_id } catch { cleanupFailures.push('patient account lookup') }
    }
    try { checked(await admin.from('patients').delete().eq('id', patientId)) } catch { cleanupFailures.push('patient row') }
  }
  for (const id of [patientAuthId, providerId].filter(Boolean)) {
    try { checked(await admin.auth.admin.deleteUser(id)) } catch { cleanupFailures.push('synthetic Auth account') }
  }
  if (cleanupFailures.length) { console.error(`Cleanup needs attention: ${[...new Set(cleanupFailures)].join(', ')}`); process.exitCode = 1 }
  else console.log('Synthetic test accounts and records cleaned up.')
}
