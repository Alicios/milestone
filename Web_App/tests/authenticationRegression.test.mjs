import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { MemoryStorage, deferred, loadTs } from './helpers/modules.mjs'
import { harness, protectedResult, denied, alice, bob, sessionFor, settle, login } from './helpers/auth.mjs'
import { sdkKey, sdkSession, realSdk, connectSdk } from './helpers/authSdk.mjs'

let previousWindow, previousDocument
test.beforeEach(() => { previousWindow = globalThis.window; previousDocument = globalThis.document })
test.afterEach(() => { globalThis.window = previousWindow; globalThis.document = previousDocument })
const allowed = (h) => assert.equal(protectedResult(h.value()).type, 'Outlet')
const drain = async (t) => { for (let i = 0; i < 12; i++) { t.mock.timers.tick(0); await setImmediate() } }
const noWrites = () => { throw new Error('Synthetic storage failure') }

test('MFA success uses the SDK expiry when the verification response has no expires_at', async (t) => {
  const initial = sdkSession({ mfa: true })
  const { expires_at, ...upgraded } = sdkSession({ mfa: true, aal: 'aal2' })
  const { sdk } = await realSdk(t, initial, async (url) => {
    const path = new URL(url).pathname
    if (path.endsWith('/challenge')) return Response.json({ id: 'challenge', type: 'totp' })
    if (path.endsWith('/verify')) return Response.json(upgraded)
    if (path.endsWith('/user')) return Response.json(initial.user)
    throw new Error(`Unexpected mocked endpoint ${path}`)
  })
  const h = connectSdk(t, sdk); await settle(); denied(h)
  await h.value().verifyMfaLogin('123456'); allowed(h)
  const active = (await sdk.getSession()).data.session
  assert.equal(active.access_token, upgraded.access_token)
  assert.ok(active.expires_at * 1000 > Date.now())
})

test('MFA rejects a same-user AAL1 replacement during provider loading (real SDK)', async (t) => {
  const initial = sdkSession({ mfa: true })
  const upgraded = sdkSession({ mfa: true, aal: 'aal2' })
  const replacement = sdkSession({ mfa: true, sid: 'new-unverified-session' })
  const { sdk } = await realSdk(t, initial, async (url) => {
    const path = new URL(url).pathname
    if (path.endsWith('/challenge')) return Response.json({ id: 'challenge', type: 'totp' })
    if (path.endsWith('/verify')) return Response.json(upgraded)
    if (path.endsWith('/user')) return Response.json(initial.user)
    if (path.endsWith('/logout')) return Response.json({})
    throw new Error(`Unexpected mocked endpoint ${path}`)
  })
  const provider = deferred(); const started = deferred()
  const h = connectSdk(t, sdk, { loadProvider: () => { started.resolve(); return provider.promise } })
  await settle()
  const pending = h.value().verifyMfaLogin('123456')
  const rejection = assert.rejects(pending, /Authentication changed/)
  await started.promise
  await sdk.setSession({ access_token: replacement.access_token, refresh_token: replacement.refresh_token })
  denied(h)
  provider.resolve(alice)
  await rejection
  denied(h)
  assert.equal((await sdk.getSession()).data.session, null)
})

test('late SDK MFA response cannot republish the account replaced while verify was pending', async (t) => {
  const initial = sdkSession({ mfa: true }); const upgraded = sdkSession({ mfa: true, aal: 'aal2' })
  const other = sdkSession({ user: bob, sid: 'bob-session' })
  const response = deferred(); const started = deferred(); let apiUser = initial.user
  const { sdk } = await realSdk(t, initial, async (url) => {
    const path = new URL(url).pathname
    if (path.endsWith('/challenge')) return Response.json({ id: 'challenge', type: 'totp' })
    if (path.endsWith('/verify')) { started.resolve(); return response.promise }
    if (path.endsWith('/user')) return Response.json(apiUser)
    if (path.endsWith('/logout')) return Response.json({})
    throw new Error(`Unexpected mocked endpoint ${path}`)
  })
  const h = connectSdk(t, sdk); await settle()
  const pending = h.value().verifyMfaLogin('123456'); const rejection = assert.rejects(pending, /Authentication changed/)
  await started.promise
  apiUser = other.user
  await sdk.setSession({ access_token: other.access_token, refresh_token: other.refresh_token })
  denied(h)
  await assert.rejects(login(h), /already in progress/)
  response.resolve(Response.json(upgraded))
  await rejection
  denied(h); assert.equal(h.state.providerCalls.length, 0)
  assert.equal((await sdk.getSession()).data.session, null)
  assert.equal(h.storage.getItem('milestone.auth.logout'), 'failed')
})

test('an extra same-user MFA event invalidates verification instead of treating it as its own response', async (t) => {
  const h = harness(t, { session: sessionFor(), assurance: { currentLevel: 'aal1', nextLevel: 'aal2' }, factors: [{ id: 'totp', status: 'verified' }] })
  await settle()
  const response = deferred(); const started = deferred()
  h.auth.mfa.verify = async () => { started.resolve(); return response.promise }
  const pending = h.value().verifyMfaLogin('123456'); const rejection = assert.rejects(pending)
  await started.promise
  h.emit('MFA_CHALLENGE_VERIFIED', sessionFor(alice, { access_token: 'external-aal2' }))
  h.emit('MFA_CHALLENGE_VERIFIED', sessionFor(alice, { access_token: 'own-aal2' }))
  response.resolve({ data: h.state.session, error: null })
  await rejection; denied(h)
})

for (const silent of [false, true]) test(`logout verifies sessionStorage fallback when localStorage ${silent ? 'silently drops writes' : 'throws'}`, async (t) => {
  const storage = new MemoryStorage(); storage.setItem = silent ? () => {} : noWrites
  const fallback = new MemoryStorage()
  const h = harness(t, { storage, sessionStorage: fallback, session: sessionFor(), signOutResults: [{ error: true }, { error: true }] })
  await settle(); allowed(h)
  await h.value().logout(); denied(h)
  assert.equal(h.state.session.user.id, alice.id) // SDK credentials survived both sign-out failures.
  assert.equal(storage.getItem('milestone.auth.logout'), null)
  assert.equal(fallback.getItem('milestone.auth.logout'), 'failed')
  assert.equal(h.value().authError, '')
  const reloaded = harness(t, { storage, sessionStorage: fallback, session: h.state.session })
  await settle(); denied(reloaded); assert.equal(reloaded.state.providerCalls.length, 0)
  await login(reloaded); allowed(reloaded)
  assert.equal(fallback.getItem('milestone.auth.logout'), null)
})

test('real SDK surviving logout credentials cannot bypass the sessionStorage marker on reload', async (t) => {
  const { sdk, storage } = await realSdk(t, sdkSession(), async (url) => {
    const path = new URL(url).pathname
    if (path.endsWith('/logout')) return Response.json({ message: 'outage' }, { status: 503 })
    if (path.endsWith('/user')) return Response.json(sdkSession().user)
    throw new Error(`Unexpected mocked endpoint ${path}`)
  })
  const fallback = new MemoryStorage()
  const h = connectSdk(t, sdk, { storage, sessionStorage: fallback }); await settle(); allowed(h)
  const set = storage.setItem.bind(storage); const remove = storage.removeItem.bind(storage)
  storage.setItem = noWrites; storage.removeItem = noWrites
  await h.value().logout(); denied(h)
  assert.ok(storage.getItem(sdkKey))
  storage.setItem = set; storage.removeItem = remove
  const reloaded = connectSdk(t, sdk, { storage, sessionStorage: fallback })
  await settle(); denied(reloaded)
})

test('both persistence failures block this tab and explicitly report the reload limitation', async (t) => {
  const storage = new MemoryStorage(); const fallback = new MemoryStorage()
  storage.setItem = noWrites; fallback.setItem = noWrites
  const h = harness(t, { storage, sessionStorage: fallback, session: sessionFor(), signOutResults: [{ error: true }, { error: true }] })
  await settle(); allowed(h)
  await h.value().logout(); denied(h)
  assert.match(h.value().authError, /could not be saved; reloading may restore/)
  assert.equal(storage.getItem('milestone.auth.logout'), null)
  assert.equal(fallback.getItem('milestone.auth.logout'), null)
  // No client code can recover an intent that neither store saved. Do not claim otherwise.
  const reloaded = harness(t, { storage, sessionStorage: fallback, session: h.state.session })
  await settle(); allowed(reloaded)
})

test('failed fresh authentication and automatic events never clear either logout marker', async (t) => {
  const storage = new MemoryStorage(); const fallback = new MemoryStorage()
  storage.setItem('milestone.auth.logout', 'failed'); fallback.setItem('milestone.auth.logout', 'pending')
  const h = harness(t, { storage, sessionStorage: fallback, session: sessionFor(), loginError: new Error('invalid') })
  await settle(); denied(h)
  h.emit('SIGNED_IN', sessionFor()); h.emit('TOKEN_REFRESHED', sessionFor()); await settle()
  await assert.rejects(login(h))
  assert.equal(storage.getItem('milestone.auth.logout'), 'failed')
  assert.equal(fallback.getItem('milestone.auth.logout'), 'pending')
})

test('storage read failures and unremovable fallback markers fail closed', async (t) => {
  const fallback = new MemoryStorage(); fallback.setItem('milestone.auth.logout', 'failed'); fallback.removeItem = noWrites
  const h = harness(t, { sessionStorage: fallback, session: sessionFor() })
  await settle(); denied(h)
  await assert.rejects(login(h), /logout block could not be cleared/); denied(h)
  const { readLogoutState } = loadTs('src/auth/logoutState.ts')
  globalThis.window.localStorage.getItem = noWrites
  assert.equal(readLogoutState(), 'failed')
})

test('expiry timer denies access before awaiting a retryable SDK session failure', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_800_000_000_000 })
  const session = sessionFor(alice, { expires_at: Date.now() / 1000 + 10 })
  const h = harness(t, { session }); await drain(t); allowed(h)
  h.state.getSession = async () => ({ data: { session: null }, error: { name: 'AuthRetryableFetchError' } })
  t.mock.timers.tick(10_000); denied(h)
  await drain(t); denied(h); assert.match(h.value().authError, /session could not be verified/)
})

test('successful refresh moves the expiry deadline without clearing the mounted outlet', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_800_000_000_000 })
  const h = harness(t, { session: sessionFor(alice, { expires_at: Date.now() / 1000 + 10 }) })
  await drain(t); allowed(h)
  const provider = h.value().user
  h.emit('TOKEN_REFRESHED', sessionFor(alice, { access_token: 'refreshed', expires_at: Date.now() / 1000 + 30 }))
  allowed(h); await drain(t); assert.equal(h.value().user, provider)
  t.mock.timers.tick(10_000); await drain(t); allowed(h)
  h.state.sessionError = new Error('outage')
  t.mock.timers.tick(20_000); await drain(t); denied(h)
})

test('tab resumption enforces expiry even if its timer was suspended', async (t) => {
  const now = Date.now; let current = now(); Date.now = () => current; t.after(() => { Date.now = now })
  const h = harness(t, { session: sessionFor(alice, { expires_at: current / 1000 + 10 }) })
  await settle(); allowed(h)
  current += 11_000
  h.state.getSession = async () => ({ data: { session: null }, error: new Error('offline') })
  globalThis.document.visibilityState = 'hidden'; h.documentEvents.get('visibilitychange')(); allowed(h)
  globalThis.document.visibilityState = 'visible'; h.documentEvents.get('visibilitychange')(); denied(h)
  await settle(); denied(h)
})

test('real SDK retryable refresh emits no event but focus revalidation denies the expired session', async (t) => {
  const now = Date.now; let current = now(); Date.now = () => current; t.after(() => { Date.now = now })
  const initial = sdkSession(); const events = []
  const { sdk, requests } = await realSdk(t, initial, async (url) => {
    const path = new URL(url).pathname
    if (path.endsWith('/user')) return Response.json(initial.user)
    assert.equal(path, '/auth/v1/token')
    current += 31_000 // Exhaust SDK retry budget without sleeping or using network.
    return Response.json({ message: 'outage' }, { status: 503 })
  })
  const { data } = sdk.onAuthStateChange((event) => events.push(event)); t.after(() => data.subscription.unsubscribe())
  const h = connectSdk(t, sdk); await settle(); allowed(h); events.length = 0
  current = initial.expires_at * 1000 + 1
  await sdk._autoRefreshTokenTick()
  assert.deepEqual(events, [])
  h.events.get('focus')(); denied(h)
  await settle(); denied(h); assert.ok(requests.includes('/auth/v1/token'))
})

test('temporary SDK refresh failure preserves an unchanged verified token until actual expiry', async (t) => {
  const now = Date.now; let current = now(); Date.now = () => current; t.after(() => { Date.now = now })
  const initial = sdkSession()
  const { sdk } = await realSdk(t, initial, async (url) => {
    const path = new URL(url).pathname
    if (path.endsWith('/user')) return Response.json(initial.user)
    assert.equal(path, '/auth/v1/token'); current += 31_000
    return Response.json({ message: 'outage' }, { status: 503 })
  })
  const h = connectSdk(t, sdk); await settle(); allowed(h)
  current = initial.expires_at * 1000 - 60_000
  h.events.get('focus')(); await settle(); allowed(h)
  current = initial.expires_at * 1000 + 1
  h.events.get('focus')(); await settle(); denied(h)
})

test('unchanged SIGNED_IN preserves provider identity and does not fetch or unmount the outlet', async (t) => {
  const h = harness(t, { session: sessionFor() }); await settle(); allowed(h)
  const provider = h.value().user; const reads = h.state.providerCalls.length
  h.emit('SIGNED_IN', h.state.session); allowed(h); await settle(); allowed(h)
  assert.equal(h.value().user, provider); assert.equal(h.state.providerCalls.length, reads)
})

test('account replacement clears old authorization immediately; failed assurance denies a refresh', async (t) => {
  const h = harness(t, { session: sessionFor() }); await settle(); allowed(h)
  h.emit('SIGNED_IN', sessionFor(bob)); denied(h); assert.equal(h.value().user, null)
  await settle(); assert.equal(h.value().user.id, bob.id)
  h.state.mfaError = new Error('unknown assurance')
  h.emit('TOKEN_REFRESHED', sessionFor(bob, { access_token: 'new-bob-token' }))
  await settle(); denied(h)
})
