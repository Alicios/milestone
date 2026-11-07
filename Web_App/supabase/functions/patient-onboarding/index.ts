import { createClient } from '@supabase/supabase-js'
import { generatePatientCode, OnboardingError, onboardingMessages, saveOnboarding } from '../_shared/patientOnboarding.ts'
import { sendPatientLoginCode } from '../_shared/patientEmail.ts'

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...headers, Allow: 'POST' } })
  try {
    const authorization = request.headers.get('Authorization') ?? ''
    if (!authorization.startsWith('Bearer ')) throw new OnboardingError('AUTH_REQUIRED', 401)
    const text = await request.text()
    if (new TextEncoder().encode(text).length > 16384) throw new OnboardingError('VALIDATION_ERROR', 413)
    let body: Record<string, unknown>
    try { body = JSON.parse(text) } catch { throw new OnboardingError('VALIDATION_ERROR', 400) }
    const patientId = typeof body?.patientId === 'string' ? body.patientId.trim() : ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patientId)) throw new OnboardingError('VALIDATION_ERROR', 400)
    if (!['generate-code', 'save-details'].includes(String(body.action))) throw new OnboardingError('VALIDATION_ERROR', 400)
    if (body.sendEmail !== undefined && typeof body.sendEmail !== 'boolean') throw new OnboardingError('VALIDATION_ERROR', 400)

    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default
    if (!url || !key) throw new OnboardingError('SERVICE_UNAVAILABLE', 503)
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, options) => fetch(input, { ...options,
        signal: options?.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) }) },
    })
    // Never accept provider_id from the caller or authorize with user metadata.
    const { data, error } = await client.auth.getUser(authorization.slice(7))
    if (error || !data.user) throw new OnboardingError('AUTH_REQUIRED', 401)
    const provider = await client.from('providers').select('id').eq('id', data.user.id).maybeSingle()
    if (provider.error) throw new OnboardingError('SERVICE_UNAVAILABLE', 503)
    if (!provider.data) throw new OnboardingError('FORBIDDEN', 403)

    if (body.action === 'generate-code') {
      return json(await generatePatientCode(client, patientId, data.user.id, body.sendEmail === true,
        (email, otp, expiry, token) => sendPatientLoginCode(email, otp, expiry, token, {
          apiKey: Deno.env.get('RESEND_API_KEY'), from: Deno.env.get('PATIENT_EMAIL_FROM'),
        })))
    }
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!name || name.length > 200 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new OnboardingError('VALIDATION_ERROR', 400)
    return json(await saveOnboarding(client, patientId, data.user.id, name, email))
  } catch (error) {
    const failure = error instanceof OnboardingError ? error : new OnboardingError('SERVICE_UNAVAILABLE', 503)
    return json({ error: { code: failure.code, message: onboardingMessages[failure.code] } }, failure.status)
  }
})
