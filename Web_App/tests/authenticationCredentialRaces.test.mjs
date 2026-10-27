import test from 'node:test'
import assert from 'node:assert/strict'
import { deferred } from './helpers/modules.mjs'
import { alice, bob, denied, protectedResult, settle } from './helpers/auth.mjs'
import { sdkKey, sdkSession, realSdk, connectSdk } from './helpers/authSdk.mjs'

const logoutKey = 'milestone.auth.logout'
const details = { name: 'Synthetic Provider', email: alice.email, password: 'synthetic-password', medicalPracticeId: 'practice' }

// Exercise the installed SDK's save-before-notify-before-return behavior. No HTTP
// can leave this in-memory transport, and no real credentials or JWTs are used.
async function pendingCredentials(t, kind, options = {}) {
  const a = sdkSession()
  const b = sdkSession({ user: bob, sid: 'newer-b-session' })
  const response = deferred(); const started = deferred()
  const cleanup = deferred(); const cleaning = deferred()
  const { sdk, storage } = await realSdk(t, null, async (url, init) => {
    const path = new URL(url).pathname
    if (path.endsWith('/token') || path.endsWith('/signup')) {
      const body = JSON.parse(init.body)
      if (body.email === bob.email) return Response.json(b)
      started.resolve(); return response.promise
    }
    if (path.endsWith('/user')) {
      const authorization = new Headers(init.headers).get('authorization')
      return Response.json(authorization === `Bearer ${b.access_token}` ? b.user : a.user)
    }
    if (path.endsWith('/logout')) {
      cleaning.resolve()
      if (options.holdCleanup) await cleanup.promise
      return Response.json({}, { status: options.cleanupStatus ?? 200 })
    }
    throw new Error(`Unexpected synthetic endpoint ${path}`)
  })
  const h = connectSdk(t, sdk, { storage, ...options.harness })
  h.auth.signInWithPassword = (args) => sdk.signInWithPassword(args)
  h.auth.signUp = (args) => sdk.signUp(args)
  await settle()
  const pending = kind === 'login' ? h.value().login(alice.email, details.password) : h.value().register(details)
  const outcome = pending.then(() => null, (error) => error)
  await started.promise
  return { a, b, sdk, storage, h, outcome, response, cleanup, cleaning }
}

function assertDiscarded(h, storage) {
  denied(h)
  assert.equal(storage.getItem(sdkKey), null, 'Stale SDK credentials must be removed, not merely hidden by UI state')
  assert.equal(storage.getItem(logoutKey), 'failed')
}

for (const kind of ['login', 'registration']) {
  test(`delayed ${kind} A cannot replace newer SDK password login B`, async (t) => {
    const { a, b, sdk, storage, h, outcome, response } = await pendingCredentials(t, kind)
    await sdk.signInWithPassword({ email: bob.email, password: details.password })
    assert.equal((await sdk.getSession()).data.session.user.id, bob.id)
    response.resolve(Response.json(a))
    assert.match((await outcome)?.message ?? '', /Authentication changed/)
    assertDiscarded(h, storage)
    assert.equal((await sdk.getSession()).data.session, null)
    // An ambiguous concurrent switch fails closed. A deliberate new sign-in is
    // allowed only after the stale SDK write and its cleanup have both settled.
    await h.value().login(bob.email, details.password)
    assert.equal(h.value().user.id, bob.id)
    assert.equal((await sdk.getSession()).data.session.access_token, b.access_token)
    assert.equal(storage.getItem(logoutKey), null)
  })

  test(`delayed ${kind} after SIGNED_OUT cannot restore UI, storage, or reload access`, async (t) => {
    const { a, sdk, storage, h, outcome, response } = await pendingCredentials(t, kind)
    await sdk.signOut({ scope: 'local' })
    denied(h)
    await assert.rejects(h.value().login(bob.email, details.password), /already in progress/)
    response.resolve(Response.json(a))
    assert.match((await outcome)?.message ?? '', /Authentication changed/)
    assertDiscarded(h, storage)
    h.emit('SIGNED_IN', a); h.emit('TOKEN_REFRESHED', a); await settle(); denied(h)
    const reloaded = connectSdk(t, sdk, { storage, sessionStorage: h.sessionStorage })
    await settle(); denied(reloaded)
    assert.equal(reloaded.state.providerCalls.length, 0)
  })

  test(`${kind} replacement while loading a provider invalidates the returned credentials`, async (t) => {
    const provider = deferred(); const loading = deferred()
    const { a, sdk, storage, h, outcome, response } = await pendingCredentials(t, kind, {
      harness: { loadProvider: () => { loading.resolve(); return provider.promise } },
    })
    response.resolve(Response.json(a)); await loading.promise
    await sdk.signInWithPassword({ email: bob.email, password: details.password })
    denied(h); provider.resolve(alice)
    assert.match((await outcome)?.message ?? '', /Authentication changed/)
    assertDiscarded(h, storage)
  })

  test(`${kind} guard remains held through stale-response cleanup and preserves a newer logout marker`, async (t) => {
    const { a, sdk, storage, h, outcome, response, cleanup, cleaning } = await pendingCredentials(t, kind, { holdCleanup: true })
    await sdk.signOut({ scope: 'local' })
    response.resolve(Response.json(a)); await cleaning.promise
    await assert.rejects(h.value().login(bob.email, details.password), /already in progress/)
    await assert.rejects(h.value().register(details), /already in progress/)
    // A concurrent logout owns its own marker; stale completion cannot clear it.
    const logout = h.value().logout()
    assert.equal(storage.getItem(logoutKey), 'pending')
    cleanup.resolve(); await logout; await outcome
    denied(h)
    assert.equal(storage.getItem(logoutKey), 'global')
    assert.equal(storage.getItem(sdkKey), null)
    assert.notEqual(protectedResult(h.value()).type, 'Outlet')
  })
}

test('credential removal failure retains durable denial and reports surviving credentials', async (t) => {
  const { a, sdk, storage, h, outcome, response } = await pendingCredentials(t, 'login')
  await sdk.signOut({ scope: 'local' })
  const remove = storage.removeItem.bind(storage)
  storage.removeItem = (key) => { if (key === sdkKey) throw new Error('Synthetic removal failure'); remove(key) }
  response.resolve(Response.json(a)); await outcome
  denied(h); assert.ok(storage.getItem(sdkKey))
  assert.equal(storage.getItem(logoutKey), 'failed')
  assert.match(h.value().authError, /could not be cleared.*Retry sign-out/)
  const reloaded = connectSdk(t, sdk, { storage, sessionStorage: h.sessionStorage })
  await settle(); denied(reloaded)
  storage.removeItem = remove
  await h.value().logout(); assert.equal(storage.getItem(sdkKey), null)
})

test('SDK cleanup HTTP error that still removes credentials is verified as locally cleared', async (t) => {
  const { a, sdk, storage, h, outcome, response } = await pendingCredentials(t, 'login', { cleanupStatus: 503 })
  await sdk.signOut({ scope: 'local' })
  response.resolve(Response.json(a)); await outcome
  assertDiscarded(h, storage)
  assert.doesNotMatch(h.value().authError, /could not be cleared/)
})

test('failed credential removal plus total marker failure explicitly retains the reload warning', async (t) => {
  const { a, sdk, storage, h, outcome, response } = await pendingCredentials(t, 'login')
  const noWrites = () => { throw new Error('Synthetic persistence failure') }
  storage.setItem = (key, value) => {
    if (key === logoutKey) noWrites()
    storage.values.set(key, value)
  }
  h.sessionStorage.setItem = noWrites
  await sdk.signOut({ scope: 'local' })
  storage.removeItem = noWrites
  response.resolve(Response.json(a)); await outcome
  denied(h); assert.ok(storage.getItem(sdkKey))
  assert.equal(storage.getItem(logoutKey), null)
  assert.match(h.value().authError, /could not be cleared/)
  assert.match(h.value().authError, /reloading may restore a remaining session/)
})

for (const kind of ['login', 'registration']) test(`${kind} thrown SDK error after saving a session still reconciles storage`, async (t) => {
  const a = sdkSession()
  const { sdk, storage } = await realSdk(t, null, async (url) => {
    if (new URL(url).pathname.endsWith('/user')) return Response.json(a.user)
    if (new URL(url).pathname.endsWith('/logout')) return Response.json({})
    throw new Error('Unexpected synthetic endpoint')
  })
  const h = connectSdk(t, sdk, { storage }); await settle()
  const brokenSdk = async () => {
    await sdk.setSession({ access_token: a.access_token, refresh_token: a.refresh_token })
    throw new Error('Synthetic failure after SDK persistence')
  }
  h.auth.signInWithPassword = brokenSdk; h.auth.signUp = brokenSdk
  await assert.rejects(kind === 'login' ? h.value().login(alice.email, details.password) : h.value().register(details))
  assertDiscarded(h, storage)
})
