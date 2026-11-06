import type { Plugin } from 'vite'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import invitePatient from '../api/invite-patient'
import updateOnboarding from '../api/update-patient-onboarding'

// Match the deployed endpoints during `npm run dev`. Server credentials stay
// in process.env and are never added to Vite's browser environment.
export function devPatientApi(env: Record<string, string>): Plugin {
  for (const key of ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!process.env[key] && env[key]) process.env[key] = env[key]
  }
  return {
    name: 'patient-onboarding-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0]
        const handler = path === '/api/invite-patient' ? invitePatient
          : path === '/api/update-patient-onboarding' ? updateOnboarding : null
        if (!handler) return next()
        const req = request as VercelRequest
        const res = response as VercelResponse
        res.status = (status: number) => { res.statusCode = status; return res }
        res.json = (body: unknown) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return res }
        try {
          let body = ''
          for await (const chunk of request) {
            body += chunk.toString()
            if (Buffer.byteLength(body) > 16384) { res.status(413).json({ error: { code: 'VALIDATION_ERROR' } }); return }
          }
          req.body = body ? JSON.parse(body) : {}
          await handler(req, res)
        } catch {
          if (!res.writableEnded) res.status(400).json({ error: { code: 'VALIDATION_ERROR' } })
        }
      })
    },
  }
}
