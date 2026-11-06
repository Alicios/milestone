import type { VercelRequest, VercelResponse } from '@vercel/node'
import { generatePatientCode, OnboardingError, providerClient, sendError } from '../server/patientOnboarding'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end() }
  try {
    const patientId = typeof req.body?.patientId === 'string' ? req.body.patientId.trim() : ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patientId)) throw new OnboardingError('VALIDATION_ERROR', 400)
    const { client, providerId } = await providerClient(req)
    return res.status(200).json(await generatePatientCode(client, patientId, providerId))
  } catch (error) { return sendError(res, error) }
}
