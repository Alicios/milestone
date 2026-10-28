import { AppError, normalizeError, type AppErrorCode } from '../lib/errors'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'

export class AuthenticationCheckError extends AppError {
  // Messages passed here are authored by the authentication flow, never SDK text.
  constructor(message: string, cause?: unknown, code: AppErrorCode = 'AUTH_VERIFICATION_FAILED') {
    const native = normalizeError(cause)
    super(code, { message, cause, sourceCode: native.sourceCode, httpStatus: native.httpStatus })
    this.name = 'AuthenticationCheckError'
  }
}

const verificationError = (error?: unknown) => {
  const normalized = normalizeError(error)
  return normalized.code === 'UNEXPECTED_ERROR'
    ? new AuthenticationCheckError('We could not verify your authentication requirements. Please try signing in again.', error)
    : normalized
}

/** Missing assurance information is an error, never evidence that MFA is optional. */
export async function needsMfaChallenge(session: Session, requireVerifiedMfa = false): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(session.access_token)
    if (error) throw error
    if (!data || !['aal1', 'aal2'].includes(data.currentLevel ?? '')
      || !['aal1', 'aal2'].includes(data.nextLevel ?? '')) throw verificationError()
    if (requireVerifiedMfa && data.currentLevel !== 'aal2') throw verificationError()
    return data.currentLevel === 'aal1' && data.nextLevel === 'aal2'
  } catch (error) {
    throw verificationError(error)
  }
}

/** Called only when a verified TOTP factor is required to finish signing in. */
export async function getVerifiedTotpFactorId(): Promise<string> {
  try {
    const { data, error } = await supabase.auth.mfa.listFactors()
    const factor = data?.totp?.find((item) => item.status === 'verified')
    if (error) throw error
    if (!factor?.id) throw verificationError()
    return factor.id
  } catch (error) {
    throw verificationError(error)
  }
}
