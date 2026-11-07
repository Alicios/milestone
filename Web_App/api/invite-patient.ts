import type { VercelRequest, VercelResponse } from '@vercel/node'
import { forwardOnboarding, generatePatientCode, OnboardingError, providerClient, sendError } from '../server/patientOnboarding.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end() }
  try {
    const patientId = typeof req.body?.patientId === 'string' ? req.body.patientId.trim() : ''
    if (req.body?.sendEmail !== undefined && typeof req.body.sendEmail !== 'boolean') throw new OnboardingError('VALIDATION_ERROR', 400)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patientId)) throw new OnboardingError('VALIDATION_ERROR', 400)
    const forwarded = await forwardOnboarding(req, { action: 'generate-code', patientId, sendEmail: req.body?.sendEmail === true })
    if (forwarded !== null) return res.status(200).json(forwarded)
    const { client, providerId } = await providerClient(req)
    return res.status(200).json(await generatePatientCode(client, patientId, providerId, req.body?.sendEmail === true))
  } catch (error) { return sendError(res, error) }
}
