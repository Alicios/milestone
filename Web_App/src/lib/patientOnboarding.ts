import { supabase } from './supabase'
import { errorMessage } from './errors'

export type OnboardingStatus = 'email_needed' | 'invitation_needed' | 'awaiting_code' | 'code_expired' | 'setup_complete'
export const onboardingLabels: Record<OnboardingStatus, string> = {
  email_needed: 'Email needed', invitation_needed: 'Invitation needed', awaiting_code: 'Awaiting code entry',
  code_expired: 'Code expired', setup_complete: 'Setup complete',
}
export type OnboardingEntry = { patientId: string; name: string; status: OnboardingStatus; needsReconciliation: boolean }
export type OnboardingDetails = OnboardingEntry & { email: string; setupComplete: boolean; code: string | null; codeExpiresAt: string | null }
export async function loadOnboardingStatuses(): Promise<OnboardingEntry[]> {
  const { data, error } = await supabase.rpc('get_patient_onboarding_statuses')
  if (error) throw new Error(errorMessage(error, 'Patient setup statuses could not be loaded.'))
  return (data ?? []).map((row: { patient_id: string; name: string; status: OnboardingStatus; needs_reconciliation: boolean }) => ({
    patientId: row.patient_id, name: row.name, status: row.status, needsReconciliation: row.needs_reconciliation,
  }))
}
export async function loadOnboardingDetails(patientId: string): Promise<OnboardingDetails> {
  const { data, error } = await supabase.rpc('get_patient_onboarding_details', { p_patient_id: patientId })
  if (error) throw new Error(errorMessage(error, 'Patient setup details could not be loaded.'))
  return data as OnboardingDetails
}
const failureMessages: Record<string, string> = {
  SETUP_COMPLETE: 'This patient has completed setup. Open their patient care page to continue.',
  EMAIL_CONFLICT: 'That email is already associated with another account. Choose a different email.',
  RECONCILIATION_REQUIRED: 'The account and patient details could not be synchronized. Save the correct details again before generating a code.',
  BUSY: 'Another change is in progress. Wait a moment, then reload this page.',
  FORBIDDEN: 'An active provider-patient relationship is required.',
  AUTH_REQUIRED: 'Please sign in to continue.',
  SAVE_FAILED: 'The changes could not be saved. Your previous details have been restored. Please try again.',
  CODE_FAILED: 'The login code could not be confirmed. Reload this page before trying again.',
}
export class OnboardingRequestError extends Error {
  constructor(public code: string) { super(failureMessages[code] ?? 'Patient setup is temporarily unavailable. Please try again.') }
}
async function request(path: string, body: object) {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new OnboardingRequestError('AUTH_REQUIRED')
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(body) })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new OnboardingRequestError(result?.error?.code ?? 'SERVICE_UNAVAILABLE')
  if (!result) throw new OnboardingRequestError('SERVICE_UNAVAILABLE')
  return result
}
export async function savePatientOnboarding(patientId: string, name: string, email: string): Promise<{ name: string; email: string; emailChanged: boolean }> {
  return request('/api/update-patient-onboarding', { patientId, name: name.trim(), email: email.trim().toLowerCase() })
}
export async function generateOnboardingCode(patientId: string): Promise<import('./supabaseData').PatientLoginCode> {
  return request('/api/invite-patient', { patientId })
}
