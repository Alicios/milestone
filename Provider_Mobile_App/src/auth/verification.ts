import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Provider } from '../types';

export async function verifyProviderSession(client: SupabaseClient, session: Session, loadProvider: (id: string, email: string) => Promise<Provider>, requireMfa = false) {
  if (!session.expires_at || session.expires_at * 1000 <= Date.now()) throw new Error('Your session has expired. Please sign in again.');
  const { data: user, error: userError } = await client.auth.getUser(session.access_token);
  if (userError || !user.user || user.user.id !== session.user.id) throw new Error('Your session could not be verified. Please sign in again.');
  const { data: assurance, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel(session.access_token);
  if (error || !assurance || !['aal1', 'aal2'].includes(assurance.currentLevel ?? '') || !['aal1', 'aal2'].includes(assurance.nextLevel ?? '')) {
    throw new Error('Authentication requirements could not be verified. Please try again.');
  }
  if (requireMfa && assurance.currentLevel !== 'aal2') throw new Error('Authentication verification is incomplete. Please try again.');
  if (assurance.currentLevel === 'aal1' && assurance.nextLevel === 'aal2') {
    const factors = await client.auth.mfa.listFactors();
    const factor = factors.data?.totp.find(item => item.status === 'verified');
    if (factors.error || !factor) throw new Error('Authentication requires a factor that is unavailable. Use the provider website to review your security settings.');
    return { kind: 'mfa' as const, factorId: factor.id };
  }
  const provider = await loadProvider(session.user.id, user.user.email ?? '');
  return { kind: 'provider' as const, provider };
}
