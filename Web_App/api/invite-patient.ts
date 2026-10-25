// Vercel serverless function. Replaces scripts/invite-patient.mjs: the
// privileged Supabase Admin API call (inviteUserByEmail) can only run with the
// service_role key, which must never reach the browser bundle, so this
// endpoint is the server-side boundary the "New Patient" form calls instead.
//
// Required Vercel project environment variables (Project Settings -> Environment
// Variables, NOT .env.local, which only configures local dev):
//   SUPABASE_SERVICE_ROLE_KEY   - Project Settings -> API -> service_role secret
//   VITE_SUPABASE_URL           - same value already used by the client build
//   PATIENT_INVITE_REDIRECT_URL - where the invite email's link should land
//                                 (see patient-setup.html); required for the
//                                 invite to be useful, not required to send it
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
  if (!accessToken) return res.status(401).json({ error: 'Sign in before inviting a patient.' })

  let client
  try {
    client = adminClient()
  } catch (configError) {
    console.error(configError)
    return res.status(500).json({ error: 'Server is not configured for patient invitations.' })
  }

  // getUser(token) validates the caller's own access token against GoTrue; it
  // works the same regardless of which key the client itself was built with.
  const { data: callerData, error: callerError } = await client.auth.getUser(accessToken)
  if (callerError || !callerData.user) return res.status(401).json({ error: 'Your session is invalid or has expired. Sign in again.' })
  const providerId = callerData.user.id

  const { data: provider, error: providerError } = await client.from('providers').select('id').eq('id', providerId).maybeSingle()
  if (providerError) { console.error(providerError); return res.status(500).json({ error: 'Could not verify your account.' }) }
  if (!provider) return res.status(403).json({ error: 'Only providers can invite patients.' })

  // Ownership check: this provider must actually have a relationship with this
  // patient. Without this, any signed-in provider could invite any patient by
  // guessing/enumerating patient IDs.
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
    .select('id, name, email, auth_user_id')
    .eq('id', patientId)
    .maybeSingle()
  if (patientError) { console.error(patientError); return res.status(500).json({ error: 'Failed to look up the patient.' }) }
  if (!patient) return res.status(404).json({ error: 'No patient was found for that ID.' })
  if (patient.auth_user_id) return res.status(409).json({ error: 'This patient already has an account.' })
  if (!patient.email) return res.status(400).json({ error: 'This patient has no email on file.' })

  const { data: created, error: inviteError } = await client.auth.admin.inviteUserByEmail(patient.email, {
    data: { name: patient.name, patient_id: patient.id },
    redirectTo: process.env.PATIENT_INVITE_REDIRECT_URL || undefined,
  })
  if (inviteError || !created.user) {
    console.error(inviteError)
    return res.status(502).json({ error: 'The invitation could not be confirmed. Review the Auth user state before retrying.' })
  }

  const { error: linkError } = await client.from('patients').update({ auth_user_id: created.user.id }).eq('id', patient.id)
  if (linkError) {
    console.error(linkError)
    return res.status(502).json({ error: 'The invitation was sent, but could not be linked to the patient record. Reconcile the link before retrying; do not invite this patient again.' })
  }

  return res.status(200).json({ email: patient.email })
}
