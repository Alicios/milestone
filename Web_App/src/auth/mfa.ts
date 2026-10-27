import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'

export class AuthenticationCheckError extends Error {}

const verificationError = () => new AuthenticationCheckError('We could not verify your authentication requirements. Please try signing in again.')

/** Missing assurance information is an error, never evidence that MFA is optional. */
export async function needsMfaChallenge(session: Session, requireVerifiedMfa = false): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(session.access_token)
    if (error || !data || !['aal1', 'aal2'].includes(data.currentLevel ?? '')
      || !['aal1', 'aal2'].includes(data.nextLevel ?? '')) throw verificationError()
    if (requireVerifiedMfa && data.currentLevel !== 'aal2') throw verificationError()
    return data.currentLevel === 'aal1' && data.nextLevel === 'aal2'
  } catch {
    throw verificationError()
  }
}

/** Called only when a verified TOTP factor is required to finish signing in. */
export async function getVerifiedTotpFactorId(): Promise<string> {
  try {
    const { data, error } = await supabase.auth.mfa.listFactors()
    const factor = data?.totp?.find((item) => item.status === 'verified')
    if (error || !factor?.id) throw verificationError()
    return factor.id
  } catch {
    throw verificationError()
  }
}
