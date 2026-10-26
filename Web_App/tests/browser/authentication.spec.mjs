import { test, expect } from '@playwright/test'
import { setup, session } from './fixture.mjs'

const sessionKey = 'sb-scrum64-test-auth-token'
const logoutKey = 'milestone.auth.logout'
const failure = { code: 'unexpected_failure', message: 'Synthetic authentication failure' }
const tokenFor = (aal = 'aal1') => [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: session.user.id, exp: 4102444800, aal, role: 'authenticated' })).toString('base64url'),
  'fixture',
].join('.')

async function authFixture(context, options = {}) {
  const state = { current: structuredClone(session), passwordFailure: false, refreshFailure: false, globalFailure: false,
    localFailure: false, refreshes: 0, logoutScopes: [], ...options }
  await setup(context, { initialSession: options.initialSession === undefined ? null : options.initialSession })
  await context.route('**/auth/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname !== 'scrum64-test.supabase.co') return route.abort()
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    if (url.pathname.endsWith('/token')) {
      const refreshing = url.searchParams.get('grant_type') === 'refresh_token'
      if (refreshing) state.refreshes++
      if (refreshing && state.beforeRefresh) await state.beforeRefresh()
      if (refreshing && state.refreshFailure) return reply({ code: 'refresh_token_not_found', message: 'Synthetic refresh failure' }, state.refreshStatus ?? 400)
      if (!refreshing && state.passwordFailure) return reply({ code: 'invalid_credentials', message: 'Invalid login credentials' }, 400)
      return reply(state.current)
    }
    if (url.pathname.endsWith('/logout')) {
      const scope = url.searchParams.get('scope'); state.logoutScopes.push(scope)
      return (scope === 'global' ? state.globalFailure : state.localFailure) ? reply(failure, 500) : reply({})
    }
    if (url.pathname.endsWith('/challenge')) return reply({ id: 'test-challenge' })
    if (url.pathname.endsWith('/verify')) {
      if (state.holdVerify) await state.holdVerify()
      state.current = { ...state.current, access_token: tokenFor('aal2') }
      const { expires_at, ...verification } = state.current
      return reply(verification)
    }
    if (url.pathname.endsWith('/user')) return reply(state.current.user)
    return route.abort()
  })
  return state
}
async function signIn(page) {
  await page.getByLabel('Work email').fill('provider@example.invalid')
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('synthetic-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}
async function signOut(page) {
  await page.getByRole('button', { name: 'Open profile menu' }).click()
  await page.getByRole('menuitem', { name: 'Logout', exact: true }).click()
}
const protectedPaths = ['/dashboard', '/dashboard/patients', '/dashboard/patients/new', '/dashboard/patients/example',
  '/dashboard/routines', '/dashboard/appointments', '/dashboard/messages', '/dashboard/profile', '/dashboard/settings']

test('every dashboard route rejects an absent session', async ({ context, page }) => {
  await authFixture(context)
  for (const path of protectedPaths) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: 'Open profile menu' })).toHaveCount(0)
  }
})

test('duplicate SIGNED_IN and same-account TOKEN_REFRESHED preserve unsaved profile edits and DOM identity', async ({ context, page }) => {
  const state = await authFixture(context, { initialSession: session })
  await page.goto('/dashboard/profile')
  await page.getByRole('button', { name: 'Edit Profile', exact: true }).click()
  const name = page.getByRole('textbox', { name: 'Full name', exact: true })
  await name.fill('Unsaved authentication regression draft')
  await name.evaluate((node) => { window.profileInputBeforeAuthEvent = node })
  await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.ts')
    const { data } = await supabase.auth.getSession()
    await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token })
  })
  await expect(name).toHaveValue('Unsaved authentication regression draft')
  expect(await name.evaluate((node) => node === window.profileInputBeforeAuthEvent)).toBe(true)
  state.current = { ...session, access_token: tokenFor().replace(/fixture$/, Buffer.from('refreshed-draft').toString('base64url')) }
  await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.ts')
    await supabase.auth.refreshSession()
  })
  await expect(name).toHaveValue('Unsaved authentication regression draft')
  expect(await name.evaluate((node) => node === window.profileInputBeforeAuthEvent)).toBe(true)
  await expect(page.getByRole('button', { name: 'Open profile menu' })).toBeVisible()
})

test('sessionStorage fallback blocks reload when marker writes and SDK credential removal fail', async ({ context, page }) => {
  await context.addInitScript(({ logoutKey, sessionKey }) => {
    const set = Storage.prototype.setItem; const remove = Storage.prototype.removeItem
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === logoutKey) throw new Error('Synthetic quota failure')
      return set.call(this, key, value)
    }
    Storage.prototype.removeItem = function (key) {
      if (this === localStorage && key === sessionKey) throw new Error('Synthetic credential removal failure')
      return remove.call(this, key)
    }
  }, { logoutKey, sessionKey })
  await authFixture(context, { initialSession: session, globalFailure: true, localFailure: true })
  await page.goto('/dashboard'); await signOut(page)
  await expect(page.getByRole('alert')).toContainText('session may still exist')
  expect(await page.evaluate((key) => localStorage.getItem(key), logoutKey)).toBeNull()
  expect(await page.evaluate((key) => sessionStorage.getItem(key), logoutKey)).toBe('failed')
  expect(await page.evaluate((key) => Boolean(localStorage.getItem(key)), sessionKey)).toBe(true)
  await page.reload(); await expect(page).toHaveURL(/\/login$/)
  await page.goto('/dashboard'); await expect(page).toHaveURL(/\/login$/)
})

test('total logout marker failure reports that reload protection could not be saved', async ({ context, page }) => {
  await context.addInitScript((key) => {
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new Error('Synthetic persistence failure')
      return set.call(this, name, value)
    }
  }, logoutKey)
  await authFixture(context, { initialSession: session })
  await page.goto('/dashboard'); await signOut(page)
  await expect(page.getByRole('alert')).toContainText('reloading may restore a remaining session')
  await expect(page).toHaveURL(/\/login$/)
})

for (const resume of [false, true]) test(`retryable SDK refresh failure denies expired access on ${resume ? 'tab resumption' : 'expiration timer'}`, async ({ context, page }) => {
  const start = Date.now()
  await page.clock.install({ time: start })
  const initial = { ...session, expires_at: Math.floor(start / 1000) + 180 }
  const state = await authFixture(context, { initialSession: initial, refreshFailure: true, refreshStatus: 503 })
  state.beforeRefresh = async () => {
    // Exhaust the SDK's retry budget while keeping all HTTP synthetic.
    const now = await page.evaluate(() => Date.now())
    await page.clock.setSystemTime(now + 31_000)
  }
  await page.goto('/dashboard'); await expect(page.getByRole('button', { name: 'Open profile menu' })).toBeVisible()
  if (resume) {
    await page.clock.setSystemTime(start + 181_000)
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  } else await page.clock.fastForward(181_000)
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: 'Open profile menu' })).toHaveCount(0)
  expect(state.refreshes).toBeGreaterThan(0)
})

for (const duringProvider of [false, true]) test(`session replacement during MFA ${duringProvider ? 'provider loading' : 'verification HTTP'} denies stale authorization`, async ({ context, page }) => {
  const required = { ...session, user: { ...session.user, factors: [{ id: 'totp', factor_type: 'totp', status: 'verified' }] } }
  const state = await authFixture(context, { current: required })
  let release; const held = new Promise((resolve) => { release = resolve }); let started
  const waiting = new Promise((resolve) => { started = resolve })
  if (duringProvider) {
    await context.route('**/rest/v1/providers*', async (route) => {
      started(); await held
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: session.user.id, name: 'Fixture Provider', initials: 'FP' }) })
    })
  } else state.holdVerify = async () => { started(); await held }
  await page.goto('/login'); await signIn(page)
  await page.getByLabel('6-digit code').fill('123456')
  await page.getByRole('button', { name: 'Verify', exact: true }).click()
  await waiting
  // Real SDK replacement emits SIGNED_IN. For the HTTP race, verify will later save its old response.
  const replacement = { ...required, access_token: tokenFor().replace(/fixture$/, Buffer.from('replacement-aal1').toString('base64url')), refresh_token: 'replacement-refresh' }
  await page.evaluate(async (replacement) => {
    const { supabase } = await import('/src/lib/supabase.ts')
    await supabase.auth.setSession({ access_token: replacement.access_token, refresh_token: replacement.refresh_token })
  }, replacement)
  release()
  await expect(page.getByRole('alert').first()).toContainText('Authentication changed during MFA')
  await expect(page.getByRole('button', { name: 'Open profile menu' })).toHaveCount(0)
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), sessionKey)).toBeNull()
  await page.reload(); await page.goto('/dashboard'); await expect(page).toHaveURL(/\/login$/)
})
test('invalid credentials show an error; successful login persists after reload and logout removes access', async ({ context, page }) => {
  const state = await authFixture(context, { passwordFailure: true })
  await page.goto('/login'); await signIn(page)
  await expect(page.getByRole('alert')).toContainText('Check your email and password')
  await expect(page).toHaveURL(/\/login$/)
  state.passwordFailure = false; await signIn(page)
  await expect(page.getByRole('button', { name: 'Open profile menu' })).toBeVisible()
  await page.reload(); await expect(page.getByRole('button', { name: 'Open profile menu' })).toBeVisible()
  await signOut(page); await expect(page).toHaveURL('http://127.0.0.1:4187/')
  expect(state.logoutScopes).toEqual(['global'])
  expect(await page.evaluate((key) => localStorage.getItem(key), sessionKey)).toBeNull()
  await page.goto('/dashboard'); await expect(page).toHaveURL(/\/login$/)
})
test('missing MFA assurance information blocks an otherwise present session', async ({ context, page }) => {
  const invalid = { ...session, access_token: tokenFor(null) }
  await authFixture(context, { initialSession: invalid, current: invalid })
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('alert')).toContainText('could not verify your authentication requirements')
  await expect(page.getByRole('button', { name: 'Open profile menu' })).toHaveCount(0)
})
test('MFA-required login stays on the code form until assurance is upgraded', async ({ context, page }) => {
  const required = { ...session, user: { ...session.user, factors: [{ id: 'totp', factor_type: 'totp', status: 'verified' }] } }
  await authFixture(context, { current: required })
  await page.goto('/login'); await signIn(page)
  await expect(page.getByLabel('6-digit code')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open profile menu' })).toHaveCount(0)
  await page.getByLabel('6-digit code').fill('123456'); await page.getByRole('button', { name: 'Verify', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open profile menu' })).toBeVisible()
})
test('global sign-out failure falls back locally and displays an accurate warning across reload', async ({ context, page }) => {
  const state = await authFixture(context, { initialSession: session, globalFailure: true })
  await page.goto('/dashboard'); await signOut(page)
  await expect(page.getByRole('alert')).toContainText('other sessions may remain active')
  expect(state.logoutScopes[0]).toBe('global')
  // SDK 2.117 also clears local storage on some global errors, so local fallback may need no HTTP call.
  expect(await page.evaluate((key) => localStorage.getItem(key), sessionKey)).toBeNull()
  expect(await page.evaluate((key) => localStorage.getItem(key), logoutKey)).toBe('local')
  await page.reload(); await expect(page.getByRole('alert')).toContainText('other sessions may remain active')
  await page.goto('/dashboard'); await expect(page).toHaveURL(/\/login$/)
})
test('both sign-out attempts failing blocks reload and offers a working retry without claiming success', async ({ context, page }) => {
  await context.addInitScript((key) => {
    const remove = Storage.prototype.removeItem
    Storage.prototype.removeItem = function (name) {
      if (name === key && !window.allowSessionRemoval) throw new Error('Synthetic storage failure')
      return remove.call(this, name)
    }
  }, sessionKey)
  const state = await authFixture(context, { initialSession: session, globalFailure: true, localFailure: true })
  await page.goto('/dashboard'); await signOut(page)
  await expect(page.getByRole('alert')).toContainText('session may still exist')
  expect(state.logoutScopes).toEqual(['global', 'local'])
  expect(await page.evaluate((key) => Boolean(localStorage.getItem(key)), sessionKey)).toBe(true)
  await page.reload(); await expect(page.getByRole('alert')).toContainText('session may still exist')
  await page.goto('/dashboard'); await expect(page).toHaveURL(/\/login$/)
  await page.evaluate(() => { window.allowSessionRemoval = true })
  state.globalFailure = false
  await page.getByRole('button', { name: 'Retry sign-out' }).click()
  await expect(page).toHaveURL('http://127.0.0.1:4187/')
  expect(await page.evaluate((key) => localStorage.getItem(key), sessionKey)).toBeNull()
})
for (const succeeds of [true, false]) test(`SDK refresh ${succeeds ? 'success restores access with the refreshed bearer' : 'failure denies protected access'}`, async ({ context, page }) => {
  const expired = { ...session, expires_at: Math.floor(Date.now() / 1000) - 60 }
  const current = { ...session, access_token: tokenFor('aal1').replace(/fixture$/, Buffer.from('refreshed-fixture').toString('base64url')) }
  expect(current.access_token).not.toBe(expired.access_token)
  const state = await authFixture(context, { initialSession: expired, current, refreshFailure: !succeeds })
  const bearerChecks = []
  page.on('request', (request) => {
    if (request.url().includes('/rest/v1/')) bearerChecks.push(request.headers().authorization === `Bearer ${current.access_token}`)
  })
  await page.goto('/dashboard')
  if (succeeds) {
    await expect(page.getByRole('button', { name: 'Open profile menu' })).toBeVisible()
    expect(bearerChecks.length).toBeGreaterThan(0); expect(bearerChecks.every(Boolean)).toBe(true)
  } else {
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: 'Open profile menu' })).toHaveCount(0)
  }
  expect(state.refreshes).toBeGreaterThan(0)
})
