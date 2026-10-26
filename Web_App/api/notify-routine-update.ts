import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

function adminClient() {
  const url = process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error('Server is missing its Supabase configuration.')
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  const routineId = typeof req.body?.routineId === 'string' ? req.body.routineId.trim() : ''
  if (!UUID.test(routineId)) return res.status(400).json({ error: 'A valid routineId is required.' })

  const authHeader = req.headers.authorization ?? ''
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''
  if (!accessToken) return res.status(401).json({ error: 'Sign in before sending routine notifications.' })

  let admin
  try {
    admin = adminClient()
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Push notifications are not configured.' })
  }

  const { data: callerData, error: callerError } = await admin.auth.getUser(accessToken)
  if (callerError || !callerData.user) return res.status(401).json({ error: 'Your session is invalid or has expired.' })
  const providerId = callerData.user.id

  const { data: provider, error: providerError } = await admin.from('providers').select('id').eq('id', providerId).maybeSingle()
  if (providerError) { console.error(providerError); return res.status(500).json({ error: 'Could not verify your provider account.' }) }
  if (!provider) return res.status(403).json({ error: 'Only providers can send routine notifications.' })

  const { data: routine, error: routineError } = await admin.from('routines')
    .select('id, provider_id').eq('id', routineId).maybeSingle()
  if (routineError) { console.error(routineError); return res.status(500).json({ error: 'Could not verify the routine.' }) }
  if (!routine || routine.provider_id !== providerId) return res.status(403).json({ error: 'This routine does not belong to your provider account.' })

  const { data: assignments, error: assignmentError } = await admin.from('routine_assignments')
    .select('patient_profile_id')
    .eq('routine_id', routineId)
    .in('status', ['scheduled', 'in progress'])
  if (assignmentError) { console.error(assignmentError); return res.status(500).json({ error: 'Could not find patients assigned to this routine.' }) }

  const profileIds = [...new Set((assignments ?? []).map((item) => item.patient_profile_id).filter(Boolean))]
  if (!profileIds.length) return res.status(200).json({ sent: 0 })

  const { data: relationships, error: relationshipError } = await admin.from('provider_patient_profiles')
    .select('id, patient_id')
    .eq('provider_id', providerId)
    .in('id', profileIds)
  if (relationshipError) { console.error(relationshipError); return res.status(500).json({ error: 'Could not verify assigned patients.' }) }

  const patientIds = [...new Set((relationships ?? []).map((item) => item.patient_id).filter(Boolean))]
  if (!patientIds.length) return res.status(200).json({ sent: 0 })

  const { data: patients, error: patientError } = await admin.from('patients')
    .select('auth_user_id')
    .in('id', patientIds)
    .not('auth_user_id', 'is', null)
  if (patientError) { console.error(patientError); return res.status(500).json({ error: 'Could not resolve patient accounts.' }) }

  const userIds = [...new Set((patients ?? []).map((item) => item.auth_user_id).filter(Boolean))]
  if (!userIds.length) return res.status(200).json({ sent: 0 })

  const { data: tokens, error: tokenError } = await admin.from('patient_push_tokens')
    .select('expo_push_token')
    .in('auth_user_id', userIds)
  if (tokenError) { console.error(tokenError); return res.status(500).json({ error: 'Could not load registered push tokens.' }) }
  const uniqueTokens = [...new Set((tokens ?? []).map((item) => item.expo_push_token))]
  if (!uniqueTokens.length) return res.status(200).json({ sent: 0 })

  const messages = uniqueTokens.map((to) => ({
    to,
    title: 'Routine updated',
    body: 'Your provider updated a care routine. Open Milestone to review the latest information.',
    sound: 'default',
    channelId: 'routine-updates',
    data: { type: 'routine_update' },
  }))

  try {
    for (const batch of chunks(messages, 100)) {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      })
      if (!response.ok) {
        console.error('Expo Push Service returned HTTP ' + response.status)
        return res.status(502).json({ error: 'The routine was saved, but push delivery could not be requested.' })
      }
    }
  } catch (error) {
    console.error(error)
    return res.status(502).json({ error: 'The routine was saved, but push delivery could not be requested.' })
  }

  return res.status(200).json({ sent: uniqueTokens.length })
}
