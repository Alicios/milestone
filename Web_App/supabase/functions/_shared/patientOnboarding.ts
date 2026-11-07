import type { SupabaseClient } from '@supabase/supabase-js'

export class OnboardingError extends Error {
  constructor(public code: string, public status: number) { super(code) }
}
export const onboardingMessages: Record<string, string> = {
  AUTH_REQUIRED: 'Please sign in to continue.',
  FORBIDDEN: 'An active provider-patient relationship is required.',
  VALIDATION_ERROR: 'Enter a full name and a valid email address.',
  SETUP_COMPLETE: 'This patient has completed setup. Open their patient care page to continue.',
  EMAIL_CONFLICT: 'That email is already associated with another account. Choose a different email.',
  BUSY: 'Another change is in progress. Wait a moment, then reload this page.',
  RECONCILIATION_REQUIRED: 'The account and patient details could not be synchronized. Save the correct details again before generating a code.',
  SAVE_FAILED: 'The changes could not be saved. Your previous details have been restored. Please try again.',
  CODE_FAILED: 'The login code could not be confirmed. Reload this page before trying again.',
  SERVICE_UNAVAILABLE: 'Patient setup is temporarily unavailable. Please try again.',
}
export function operationError(error: { code?: string; message?: string } | null): OnboardingError {
  if (error?.message === 'SETUP_COMPLETE') return new OnboardingError('SETUP_COMPLETE', 409)
  if (error?.message === 'RECONCILIATION_REQUIRED') return new OnboardingError('RECONCILIATION_REQUIRED', 409)
  if (error?.code === '42501') return new OnboardingError('FORBIDDEN', 403)
  if (error?.code === '23505' || error?.code === 'email_exists') return new OnboardingError('EMAIL_CONFLICT', 409)
  if (error?.code === '55P03') return new OnboardingError('BUSY', 409)
  return new OnboardingError('SERVICE_UNAVAILABLE', 503)
}
type Operation = { token: string; patient: { id: string; name: string; email: string | null; auth_user_id: string | null }; needsReconciliation: boolean }
async function begin(client: SupabaseClient, patientId: string, providerId: string, kind: 'edit' | 'invite'): Promise<Operation> {
  const { data, error } = await client.rpc('begin_patient_onboarding_operation', { p_patient_id: patientId, p_provider_id: providerId, p_kind: kind })
  if (error) throw operationError(error)
  if (!data?.token || !data?.patient) throw new OnboardingError('SERVICE_UNAVAILABLE', 503)
  return data as Operation
}
async function release(client: SupabaseClient, op: Operation, reconciled: boolean, clearCode: boolean) {
  try {
    const result = await client.rpc('release_patient_onboarding_operation', {
      p_patient_id: op.patient.id, p_token: op.token, p_reconciled: reconciled, p_clear_code: clearCode,
    })
    return !result.error
  } catch { return false }
}
export async function saveOnboarding(client: SupabaseClient, patientId: string, providerId: string, name: string, email: string) {
  const op = await begin(client, patientId, providerId, 'edit')
  const previous = op.patient
  let authTouched = false
  const emailChanged = (previous.email ?? '').toLowerCase() !== email
  try {
    if (previous.auth_user_id) {
      const current = await client.auth.admin.getUserById(previous.auth_user_id)
      if (current.error || !current.data.user) throw new OnboardingError('SERVICE_UNAVAILABLE', 503)
      if (current.data.user.last_sign_in_at) throw new OnboardingError('SETUP_COMPLETE', 409)
      // Name-only changes preserve the pending login token.
      if (emailChanged || op.needsReconciliation || current.data.user.email?.toLowerCase() !== email) {
        authTouched = true // A transport failure may happen after the write commits.
        const updated = await client.auth.admin.updateUserById(previous.auth_user_id, { email })
        if (updated.error) throw operationError(updated.error)
        if (updated.data.user?.email?.toLowerCase() !== email) throw new OnboardingError('RECONCILIATION_REQUIRED', 409)
      }
    }
    const committed = await client.rpc('complete_patient_onboarding_operation', {
      p_patient_id: patientId, p_token: op.token, p_result: { name, email },
    })
    if (committed.error) throw operationError(committed.error)
    return { patientId, name, email, emailChanged }
  } catch (error) {
    // Confirm a potentially committed write before attempting compensation.
    if (!(error instanceof OnboardingError && ['SETUP_COMPLETE', 'EMAIL_CONFLICT', 'FORBIDDEN', 'BUSY'].includes(error.code))) {
      try {
        const saved = await client.from('patients').select('name,email').eq('id', patientId).maybeSingle()
        if (!saved.error && saved.data?.name === name && saved.data?.email?.toLowerCase() === email) {
          const verified = previous.auth_user_id ? await client.auth.admin.getUserById(previous.auth_user_id) : null
          if (!verified || (!verified.error && verified.data.user?.email?.toLowerCase() === email)) {
            if (!await release(client, op, true, emailChanged)) throw new OnboardingError('RECONCILIATION_REQUIRED', 409)
            return { patientId, name, email, emailChanged }
          }
        }
      } catch { /* Recovery below; do not claim an unconfirmed save. */ }
    }
    let reconciled = !op.needsReconciliation
    if (authTouched && previous.auth_user_id) {
      try {
        const restored = await client.auth.admin.updateUserById(previous.auth_user_id, { email: previous.email! })
        reconciled = !restored.error && restored.data.user?.email?.toLowerCase() === previous.email?.toLowerCase()
      } catch { reconciled = false }
    }
    const released = await release(client, op, reconciled, authTouched || !reconciled)
    if (!reconciled || !released) throw new OnboardingError('RECONCILIATION_REQUIRED', 409)
    if (error instanceof OnboardingError && ['SETUP_COMPLETE', 'EMAIL_CONFLICT', 'FORBIDDEN', 'BUSY'].includes(error.code)) throw error
    throw new OnboardingError('SAVE_FAILED', 503)
  }
}
export async function generatePatientCode(client: SupabaseClient, patientId: string, providerId: string, sendEmail = false, sendLoginCode?: (email: string, otp: string, expiresAt: string, operationToken: string) => Promise<'sent' | 'failed' | 'not_configured'>) {
  const op = await begin(client, patientId, providerId, 'invite')
  try {
    const { patient } = op
    if (!patient.email) throw new OnboardingError('VALIDATION_ERROR', 400)
    const { data, error } = await client.auth.admin.generateLink({ type: 'magiclink', email: patient.email,
      options: { data: { name: patient.name, patient_id: patient.id } } })
    const otp = data?.properties?.email_otp
    if (error || !otp || !data.user) throw error ? operationError(error) : new OnboardingError('CODE_FAILED', 502)
    const expiresAt = new Date(Date.now() + 3600_000).toISOString()
    const stored = await client.rpc('complete_patient_onboarding_operation', { p_patient_id: patientId, p_token: op.token,
      p_result: { code: otp, expiresAt, authUserId: data.user.id } })
    if (stored.error) throw operationError(stored.error)
    if (!sendEmail) return { email: patient.email, otp, expiresAt }
    const emailStatus = sendLoginCode ? await sendLoginCode(patient.email, otp, expiresAt, op.token) : 'not_configured'
    return { email: patient.email, otp, expiresAt, emailStatus }
  } catch (error) {
    await release(client, op, true, true)
    throw error instanceof OnboardingError ? error : new OnboardingError('CODE_FAILED', 502)
  }
}
