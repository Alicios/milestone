import test from 'node:test'
import assert from 'node:assert/strict'
import { deferred, MemoryStorage } from './helpers/modules.mjs'
import { harness, protectedResult, denied, login, alice, bob, sessionFor, settle } from './helpers/auth.mjs'

// SDK responses are mocked; these are application lifecycle tests, not JWT validation tests.
test('successful password login checks MFA and publishes the current provider', async (t) => {
  const h = harness(t); await settle()
  assert.deepEqual(await login(h), { status: 'signed-in' })
  assert.equal(h.value().user.id, alice.id)
  assert.equal(protectedResult(h.value()).type, 'Outlet')
  assert.equal(h.state.calls[0][1].email, alice.email)
})
test('invalid credentials fail closed with a safe message', async (t) => {
  const h = harness(t, { loginError: { message: 'private backend details' } }); await settle()
  await assert.rejects(login(h), /Check your email and password/)
  denied(h); assert.equal(h.state.providerCalls.length, 0)
  assert.doesNotMatch(h.value().authError, /private/)
})
test('reload restores a valid existing session', async (t) => {
  const h = harness(t, { session: sessionFor() }); denied(h); await settle()
  assert.equal(h.value().user.id, alice.id); assert.equal(h.value().loading, false)
})
for (const [name, options] of [
  ['missing session', {}],
  ['malformed session', { session: { user: {} } }],
  ['rejected or expired session', { session: sessionFor(), sessionError: new Error('expired') }],
  ['session transport failure', { getSession: async () => { throw new Error('offline') } }],
]) test(`${name} never opens a protected route`, async (t) => {
  const h = harness(t, options); await settle(); denied(h); assert.equal(h.value().loading, false)
})
for (const [name, options] of [
  ['returned MFA error', { mfaError: new Error('private details') }],
  ['thrown MFA error', { checkMfa: async () => { throw new Error('offline') } }],
  ['missing assurance data', { assurance: null }],
  ['unknown assurance level', { assurance: { currentLevel: null, nextLevel: null } }],
]) test(`${name} fails closed for login and later SDK callbacks`, async (t) => {
  const h = harness(t, options); await settle()
  await assert.rejects(login(h), /could not verify your authentication requirements/)
  denied(h)
  h.state.mfaError = null; h.state.checkMfa = null
  h.state.assurance = { currentLevel: 'aal1', nextLevel: 'aal1' }
  h.emit('TOKEN_REFRESHED', sessionFor()); await settle(); denied(h)
  assert.equal(h.state.providerCalls.length, 0)
})
test('MFA failure during restoration blocks access and surfaces an error', async (t) => {
  const h = harness(t, { session: sessionFor(), mfaError: new Error('offline') }); await settle()
  denied(h); assert.match(h.value().authError, /could not verify/)
})
test('an MFA-required account remains blocked until successful verification', async (t) => {
  const h = harness(t, { assurance: { currentLevel: 'aal1', nextLevel: 'aal2' }, factors: [{ id: 'totp', status: 'verified' }] }); await settle()
  assert.deepEqual(await login(h), { status: 'mfa-required' })
  assert.equal(h.value().mfaChallengePending, true); denied(h)
  await h.value().verifyMfaLogin('123456')
  assert.equal(protectedResult(h.value()).type, 'Outlet'); assert.equal(h.value().mfaChallengePending, false)
})
test('reload of an MFA-required session still requires the challenge', async (t) => {
  const h = harness(t, { session: sessionFor(), assurance: { currentLevel: 'aal1', nextLevel: 'aal2' }, factors: [{ id: 'totp', status: 'verified' }] }); await settle()
  denied(h); assert.equal(h.value().mfaChallengePending, true)
})
for (const factorError of [null, new Error('factor lookup failed')]) test(`MFA requirement without an available factor fails closed (${Boolean(factorError)})`, async (t) => {
  const h = harness(t, { assurance: { currentLevel: 'aal1', nextLevel: 'aal2' }, factorError }); await settle()
  await assert.rejects(login(h), /could not verify/); denied(h)
})
for (const problem of ['challengeError', 'verifyError', 'noAssuranceUpgrade']) test(`MFA ${problem} cannot publish a provider and permits a code retry`, async (t) => {
  const h = harness(t, { assurance: { currentLevel: 'aal1', nextLevel: 'aal2' }, factors: [{ id: 'totp', status: 'verified' }], [problem]: true }); await settle()
  await login(h); await assert.rejects(h.value().verifyMfaLogin('123456')); denied(h)
  assert.equal(h.value().mfaChallengePending, true)
  h.state[problem] = false
  await h.value().verifyMfaLogin('123456'); assert.equal(h.value().user.id, alice.id)
})
test('an existing AAL2 session does not challenge again', async (t) => {
  const h = harness(t, { session: sessionFor(), assurance: { currentLevel: 'aal2', nextLevel: 'aal2' } }); await settle()
  assert.equal(h.value().user.id, alice.id); assert.equal(h.value().mfaChallengePending, false)
})
for (const [outcome, results, scopes] of [
  ['global', [], ['global']],
  ['local', [{ error: new Error('global failed') }], ['global', 'local']],
  ['failed', [{ error: new Error('global failed') }, { error: new Error('local failed') }], ['global', 'local']],
  ['failed', [new Error('global threw'), new Error('local threw')], ['global', 'local']],
]) test(`logout outcome ${outcome} (${results[0] instanceof Error ? 'thrown' : 'returned'}) blocks stale callbacks and persists denial`, async (t) => {
  const h = harness(t, { session: sessionFor(), signOutResults: results }); await settle()
  const operation = h.value().logout(); denied(h)
  assert.equal(h.value().logoutState, 'pending')
  await operation
  assert.equal(h.value().logoutState, outcome)
  assert.deepEqual(h.state.calls.filter(([name]) => name === 'logout').map(([, scope]) => scope), scopes)
  assert.equal(h.storage.getItem('milestone.auth.logout'), outcome)
  h.emit('SIGNED_IN', sessionFor()); h.emit('TOKEN_REFRESHED', sessionFor()); await settle(); denied(h)
  assert.equal(h.state.navigations.at(-1)[0], outcome === 'global' ? '/' : '/login')
})
test('failed logout persists across reload; a fresh successful login clears the block', async (t) => {
  const storage = new MemoryStorage(); storage.setItem('milestone.auth.logout', 'failed')
  const h = harness(t, { storage, session: sessionFor() }); await settle(); denied(h)
  assert.equal(h.state.providerCalls.length, 0)
  await login(h); assert.equal(h.value().user.id, alice.id); assert.equal(storage.getItem('milestone.auth.logout'), null)
})
test('failed logout can be retried and concurrent clicks share one operation', async (t) => {
  const first = deferred()
  const h = harness(t, { session: sessionFor(), signOutResults: [() => first.promise, { error: true }] }); await settle()
  const a = h.value().logout(); const b = h.value().logout(); assert.equal(a, b)
  await assert.rejects(login(h), /already in progress/)
  first.resolve({ error: true }); await a; assert.equal(h.value().logoutState, 'failed')
  await h.value().logout(); assert.equal(h.value().logoutState, 'global'); denied(h)
})
test('cancelling an MFA login uses the same global/local fallback', async (t) => {
  const h = harness(t, { assurance: { currentLevel: 'aal1', nextLevel: 'aal2' }, factors: [{ id: 'totp', status: 'verified' }], signOutResults: [{ error: true }] }); await settle()
  await login(h); await h.value().cancelMfaLogin()
  assert.equal(h.value().logoutState, 'local'); assert.equal(h.value().mfaChallengePending, false); denied(h)
})
test('logout invalidates a pending password response before provider publication', async (t) => {
  const response = deferred(); const h = harness(t, { login: () => response.promise }); await settle()
  const pending = login(h); const rejection = assert.rejects(pending, /Authentication changed/)
  await h.value().logout()
  h.state.session = sessionFor(); response.resolve({ data: { user: alice, session: h.state.session }, error: null })
  await rejection; denied(h); assert.equal(h.state.providerCalls.length, 0)
})
test('logout invalidates an in-flight provider read', async (t) => {
  const profile = deferred(); const h = harness(t, { session: sessionFor(), loadProvider: () => profile.promise }); await settle()
  await h.value().logout(); profile.resolve(alice); await settle(); denied(h)
})
test('a stale account response cannot replace the new account', async (t) => {
  const profile = deferred(); const h = harness(t, { session: sessionFor(), loadProvider: (id) => id === alice.id ? profile.promise : bob }); await settle()
  h.emit('SIGNED_IN', sessionFor(bob)); await settle(); assert.equal(h.value().user.id, bob.id)
  profile.resolve(alice); await settle(); assert.equal(h.value().user.id, bob.id)
})
test('token refresh success rechecks the current session and keeps authorized access', async (t) => {
  const h = harness(t, { session: sessionFor() }); await settle()
  h.emit('TOKEN_REFRESHED', sessionFor(alice, { access_token: 'refreshed-access' })); assert.equal(protectedResult(h.value()).type, 'Outlet'); await settle()
  assert.equal(h.value().user.id, alice.id)
})
test('token refresh/session failure removes previously authorized access', async (t) => {
  const h = harness(t, { session: sessionFor() }); await settle()
  h.state.sessionError = new Error('refresh rejected'); h.emit('TOKEN_REFRESHED', sessionFor()); await settle()
  denied(h); assert.match(h.value().authError, /session could not be verified/)
})
test('refresh failure reported by SDK as SIGNED_OUT removes access', async (t) => {
  const h = harness(t, { session: sessionFor() }); await settle()
  h.emit('SIGNED_OUT', null); denied(h); assert.equal(h.value().user, null)
})
test('logout in another tab invalidates provider reads and closes protected access', async (t) => {
  const h = harness(t, { session: sessionFor() }); await settle()
  h.storage.setItem('milestone.auth.logout', 'pending'); h.events.get('storage')({ key: 'milestone.auth.logout' })
  denied(h); h.emit('TOKEN_REFRESHED', sessionFor()); await settle(); denied(h)
})
test('unavailable browser storage fails closed without claiming logout success', async (t) => {
  const storage = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') }, removeItem() { throw new Error('blocked') } }
  const h = harness(t, { storage, session: sessionFor() }); await settle(); denied(h)
  await assert.rejects(login(h)); denied(h)
})
test('registration checks authentication before granting access and preserves email confirmation flow', async (t) => {
  const h = harness(t, { confirmEmail: true }); await settle()
  const details = { name: 'Provider', email: alice.email, password: 'synthetic', medicalPracticeId: 'practice' }
  await assert.rejects(h.value().register(details), /Confirm your email/); denied(h)
  h.state.confirmEmail = false
  await h.value().register(details); assert.equal(h.value().user.id, alice.id)
})
test('route guard rejects missing users, pending MFA, auth errors, and logout states even with a stale user', () => {
  for (const overrides of [{ user: null }, { authError: 'verification failed' }, { mfaChallengePending: true }, { logoutState: 'failed' }, { logoutState: 'local' }]) {
    const result = protectedResult({ user: alice, loading: false, ...overrides })
    assert.equal(result.type, 'Navigate'); assert.equal(result.props.to, '/login')
  }
  assert.equal(protectedResult({ user: alice, loading: true }).type, 'Box')
})
