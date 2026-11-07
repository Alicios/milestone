import { sendPatientLoginCode as sendCode } from '../supabase/functions/_shared/patientEmail.js'
export type { EmailStatus } from '../supabase/functions/_shared/patientEmail.js'

export async function sendPatientLoginCode(email: string, otp: string, expiresAt: string, operationToken: string, fetchImpl: typeof fetch = fetch) {
  return sendCode(email, otp, expiresAt, operationToken, { apiKey: process.env.RESEND_API_KEY, from: process.env.PATIENT_EMAIL_FROM }, fetchImpl)
}
