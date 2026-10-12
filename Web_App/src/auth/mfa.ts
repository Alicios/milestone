import { supabase } from '../lib/supabase'

/** True when the session signed in with a password (aal1) but owes a TOTP
 * challenge before it should be treated as fully authenticated. */
export async function needsMfaChallenge(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) { console.error(error); return false }
  return data.currentLevel === 'aal1' && data.nextLevel === 'aal2'
}

/** The verified TOTP factor id to challenge against, if any. */
export async function getVerifiedTotpFactorId(): Promise<string | null> {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) { console.error(error); return null }
  return data.totp.find((factor) => factor.status === 'verified')?.id ?? null
}
