import type { VercelRequest, VercelResponse } from '@vercel/node'
import { forwardOnboarding, OnboardingError, providerClient, saveOnboarding, sendError } from '../server/patientOnboarding.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end() }
  try {
    const patientId = typeof req.body?.patientId === 'string' ? req.body.patientId.trim() : ''
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patientId) || !name || name.length > 200 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new OnboardingError('VALIDATION_ERROR', 400)
    }
    const forwarded = await forwardOnboarding(req, { action: 'save-details', patientId, name, email })
    if (forwarded !== null) return res.status(200).json(forwarded)
    const { client, providerId } = await providerClient(req)
    return res.status(200).json(await saveOnboarding(client, patientId, providerId, name, email))
  } catch (error) { return sendError(res, error) }
}
