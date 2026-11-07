import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { generatePatientCode as generateCode, OnboardingError, onboardingMessages } from '../supabase/functions/_shared/patientOnboarding.js'
import { sendPatientLoginCode } from './patientEmail.js'
export { OnboardingError, operationError, saveOnboarding } from '../supabase/functions/_shared/patientOnboarding.js'

export function sendError(res: VercelResponse, error: unknown) {
  const failure = error instanceof OnboardingError ? error : new OnboardingError('SERVICE_UNAVAILABLE', 503)
  return res.status(failure.status).json({ error: { code: failure.code, message: onboardingMessages[failure.code] } })
}
export async function providerClient(req: VercelRequest) {
  const header = req.headers.authorization ?? ''
  if (!header.startsWith('Bearer ')) throw new OnboardingError('AUTH_REQUIRED', 401)
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new OnboardingError('SERVICE_UNAVAILABLE', 503)
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, options) => fetch(input, { ...options,
      signal: options?.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) }) },
  })
  const { data, error } = await client.auth.getUser(header.slice(7))
  if (error || !data.user) throw new OnboardingError('AUTH_REQUIRED', 401)
  const provider = await client.from('providers').select('id').eq('id', data.user.id).maybeSingle()
  if (provider.error) throw new OnboardingError('SERVICE_UNAVAILABLE', 503)
  if (!provider.data) throw new OnboardingError('FORBIDDEN', 403)
  return { client, providerId: data.user.id }
}

export async function generatePatientCode(client: SupabaseClient, patientId: string, providerId: string, sendEmail = false) {
  return generateCode(client, patientId, providerId, sendEmail, sendPatientLoginCode)
}

// Local development can use the project's authenticated Edge Function without
// copying an administrator credential onto the developer's computer.
export async function forwardOnboarding(req: VercelRequest, body: object): Promise<unknown | null> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return null
  const authorization = req.headers.authorization ?? ''
  if (!authorization.startsWith('Bearer ')) throw new OnboardingError('AUTH_REQUIRED', 401)
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new OnboardingError('SERVICE_UNAVAILABLE', 503)
  try {
    const response = await fetch(`${url}/functions/v1/patient-onboarding`, {
      method: 'POST', headers: { Authorization: authorization, apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(45000),
    })
    const result = await response.json() as { error?: { code?: string } }
    if (!response.ok) {
      const code = result?.error?.code
      if (code && Object.hasOwn(onboardingMessages, code)) throw new OnboardingError(code, response.status)
      throw new OnboardingError(response.status === 401 ? 'AUTH_REQUIRED' : 'SERVICE_UNAVAILABLE', response.status === 401 ? 401 : 503)
    }
    if (!result || typeof result !== 'object') throw new OnboardingError('SERVICE_UNAVAILABLE', 503)
    return result
  } catch (error) {
    throw error instanceof OnboardingError ? error : new OnboardingError('SERVICE_UNAVAILABLE', 503)
  }
}
