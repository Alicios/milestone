import { GoTrueClient } from '@supabase/auth-js'
import { MemoryStorage } from './modules.mjs'
import { harness, alice } from './auth.mjs'

// All SDK HTTP calls use the supplied in-memory transport, never global fetch.
const sdkKey = 'independent-review-auth'
function sdkSession({ user = alice, aal = 'aal1', mfa = false, sid = 'session-a', expires = Math.floor(Date.now() / 1000) + 3600 } = {}) {
  const jwt = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: user.id, aal, session_id: sid, exp: expires, role: 'authenticated' })).toString('base64url'),
    Buffer.from('synthetic-signature').toString('base64url'),
  ].join('.')
  return { access_token: jwt, refresh_token: `synthetic-${sid}-${aal}`, expires_at: expires,
    expires_in: 3600, token_type: 'bearer', user: { ...user, factors: mfa ? [{ id: 'totp', factor_type: 'totp', status: 'verified' }] : [] } }
}
async function realSdk(t, session, transport) {
  const storage = new MemoryStorage()
  storage.setItem(sdkKey, JSON.stringify(session))
  const requests = []
  const sdk = new GoTrueClient({ url: 'https://scrum47-review.invalid/auth/v1', storage, storageKey: sdkKey,
    autoRefreshToken: false, detectSessionInUrl: false, persistSession: true,
    fetch: async (url, init) => {
      requests.push(new URL(url).pathname)
      return transport(url, init)
    } })
  await sdk.initialize()
  t.after(() => sdk.dispose())
  return { sdk, storage, requests }
}
function connectSdk(t, sdk, options = {}) {
  const h = harness(t, { getSession: () => sdk.getSession(), checkMfa: (token) => sdk.mfa.getAuthenticatorAssuranceLevel(token), ...options })
  h.auth.signOut = (args) => sdk.signOut(args)
  h.auth.mfa.listFactors = () => sdk.mfa.listFactors()
  h.auth.mfa.challenge = (args) => sdk.mfa.challenge(args)
  h.auth.mfa.verify = (args) => sdk.mfa.verify(args)
  const { data } = sdk.onAuthStateChange((event, session) => h.emit(event, session))
  t.after(() => data.subscription.unsubscribe())
  return h
}


export { sdkKey, sdkSession, realSdk, connectSdk };
