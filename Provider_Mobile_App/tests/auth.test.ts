import test from 'node:test';
import assert from 'node:assert/strict';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { verifyProviderSession } from '../src/auth/verification';
import type { Provider } from '../src/types';

const provider: Provider = { id: 'provider-a', name: 'Provider A', email: 'a@example.test', professionalTitle: null, phone: null, practice: null, avatarUrl: null };
const session = { user: { id: provider.id }, access_token: 'verified-token', expires_at: Math.floor(Date.now() / 1000) + 3600 } as Session;
function client({ userId = provider.id, currentLevel = 'aal1', nextLevel = 'aal1', error = null as unknown, factors = [{ id: 'factor-a', status: 'verified' }] } = {}) {
  return { auth: { getUser: async () => ({ data: { user: { id: userId, email: provider.email } }, error: null }),
    mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel, nextLevel }, error }), listFactors: async () => ({ data: { totp: factors }, error: null }) } } } as unknown as SupabaseClient;
}
test('verified session must also have an accessible provider profile', async () => {
  const result = await verifyProviderSession(client(), session, async id => { assert.equal(id, provider.id); return provider; });
  assert.equal(result.kind, 'provider');
  await assert.rejects(verifyProviderSession(client(), session, async () => { throw new Error('No provider membership'); }), /membership/);
});
test('missing assurance information and mismatched identities never grant access', async () => {
  for (const c of [client({ currentLevel: '' }), client({ nextLevel: '' }), client({ error: new Error('offline') }), client({ userId: 'patient' })]) {
    let loaded = false;
    await assert.rejects(verifyProviderSession(c, session, async () => { loaded = true; return provider; }));
    assert.equal(loaded, false);
  }
});
test('MFA-required sessions cannot load provider care data before verification', async () => {
  let loaded = false;
  const result = await verifyProviderSession(client({ nextLevel: 'aal2' }), session, async () => { loaded = true; return provider; });
  assert.deepEqual(result, { kind: 'mfa', factorId: 'factor-a' });
  assert.equal(loaded, false);
  await assert.rejects(verifyProviderSession(client({ nextLevel: 'aal2', factors: [] }), session, async () => provider));
  await assert.rejects(verifyProviderSession(client(), session, async () => provider, true), /incomplete/);
  assert.equal((await verifyProviderSession(client({ currentLevel: 'aal2', nextLevel: 'aal2' }), session, async () => provider, true)).kind, 'provider');
});
test('expired sessions fail before any profile lookup', async () => {
  await assert.rejects(verifyProviderSession(client(), { ...session, expires_at: 1 }, async () => provider), /expired/);
});
