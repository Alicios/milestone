// Vercel serverless function. Generates a patient a one-time passcode (OTP)
// via Supabase Admin's generateLink — the patient enters it directly in
// Mobile_App to sign in, no password ever exists. generateLink returns the
// raw code synchronously and never sends an email itself (unlike
// signInWithOtp), so this has no Custom SMTP / sending-domain dependency: the
// code is stored on the patient row for the provider's web app to display
// and relay to the patient directly. This still needs service_role both for
// the admin API call and for the ownership checks below (is the caller
// really a provider who owns this patient?), which bypass RLS.
//
// Required Vercel project environment variables (Project Settings -> Environment
// Variables, NOT .env.local, which only configures local dev):
//   SUPABASE_SERVICE_ROLE_KEY - Project Settings -> API -> service_role secret
//   VITE_SUPABASE_URL         - same value already used by the client build
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error('Server is missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  const patientId = typeof req.body?.patientId === 'string' ? req.body.patientId.trim() : ''
  if (!patientId) return res.status(400).json({ error: 'A patientId is required.' })

  const authHeader = req.headers.authorization ?? ''
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''
  if (!accessToken) return res.status(401).json({ error: 'Sign in before sending a patient a code.' })

  let client
  try {
    client = adminClient()
  } catch (configError) {
    console.error(configError)
    return res.status(500).json({ error: 'Server is not configured to send patient codes.' })
  }

  // getUser(token) validates the caller's own access token against GoTrue; it
  // works the same regardless of which key the client itself was built with.
  const { data: callerData, error: callerError } = await client.auth.getUser(accessToken)
  if (callerError || !callerData.user) return res.status(401).json({ error: 'Your session is invalid or has expired. Sign in again.' })
  const providerId = callerData.user.id

  const { data: provider, error: providerError } = await client.from('providers').select('id').eq('id', providerId).maybeSingle()
  if (providerError) { console.error(providerError); return res.status(500).json({ error: 'Could not verify your account.' }) }
  if (!provider) return res.status(403).json({ error: 'Only providers can send patient codes.' })

  // Ownership check: this provider must actually have a relationship with this
  // patient. Without this, any signed-in provider could message any patient
  // by guessing/enumerating patient IDs.
  const { data: relationship, error: relationshipError } = await client
    .from('provider_patient_profiles')
    .select('id')
    .eq('provider_id', providerId)
    .eq('patient_id', patientId)
    .maybeSingle()
  if (relationshipError) { console.error(relationshipError); return res.status(500).json({ error: 'Could not verify this patient relationship.' }) }
  if (!relationship) return res.status(403).json({ error: 'Patient relationship not found.' })

  const { data: patient, error: patientError } = await client
    .from('patients')
    .select('id, name, email')
    .eq('id', patientId)
    .maybeSingle()
  if (patientError) { console.error(patientError); return res.status(500).json({ error: 'Failed to look up the patient.' }) }
  if (!patient) return res.status(404).json({ error: 'No patient was found for that ID.' })
  if (!patient.email) return res.status(400).json({ error: 'This patient has no email on file.' })

  // Safe to call whether or not this patient already has an account: for a
  // brand-new email this creates the Auth user (handle_new_user() links it
  // back to patients.auth_user_id via the patient_id tag below); for an
  // existing one, this is just a fresh code — e.g. a new device, or their
  // previous code expired. Either way, no email is sent; the raw code comes
  // back in the response for this endpoint's caller (the provider's browser)
  // to display and relay to the patient.
  const { data: linkData, error: linkError } = await client.auth.admin.generateLink({
    type: 'magiclink',
    email: patient.email,
    options: { data: { name: patient.name, patient_id: patient.id } },
  })
  const otp = linkData?.properties?.email_otp
  if (linkError || !otp) {
    console.error(linkError)
    return res.status(502).json({ error: 'The code could not be generated. Try again.' })
  }

  // Client-side expiry estimate only; keep in sync with the Supabase
  // Dashboard's Authentication -> Sign In / Providers -> Email -> OTP expiry
  // setting (default 3600s). Supabase enforces the real expiry independently
  // when the patient calls verifyOtp.
  const OTP_TTL_SECONDS = 3600
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString()

  const { error: storeError } = await client
    .from('patients')
    .update({ pending_otp_code: otp, pending_otp_expires_at: expiresAt })
    .eq('id', patient.id)
  if (storeError) {
    console.error(storeError)
    return res.status(500).json({ error: 'The code was generated but could not be saved. Try again.' })
  }

  return res.status(200).json({ email: patient.email, otp, expiresAt })
}
