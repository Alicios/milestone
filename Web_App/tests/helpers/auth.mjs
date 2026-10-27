import assert from 'node:assert/strict'
import { loadTs, hooks, deferred, MemoryStorage } from './modules.mjs'

const alice = { id: 'provider-a', email: 'alice@example.invalid' }
const bob = { id: 'provider-b', email: 'bob@example.invalid' }
const sessionFor = (user = alice, overrides = {}) => ({ user, access_token: `access-${user.id}`, refresh_token: `refresh-${user.id}`, expires_at: 4102444800, ...overrides })
const settle = () => new Promise((resolve) => setTimeout(resolve, 10))
const cleanupKey = Symbol('auth harness cleanup')

function harness(t, options = {}) {
  if (!t[cleanupKey]) {
    const savedWindow = globalThis.window; const savedDocument = globalThis.document
    const runners = []
    t[cleanupKey] = runners
    t.after(() => {
      runners.reverse().forEach((runner) => runner.unmount())
      globalThis.window = savedWindow; globalThis.document = savedDocument
    })
  }
  const storage = options.storage ?? new MemoryStorage()
  const sessionStorage = options.sessionStorage ?? new MemoryStorage()
  const events = new Map()
  const documentEvents = new Map()
  globalThis.document = { visibilityState: 'visible', addEventListener: (name, fn) => documentEvents.set(name, fn), removeEventListener: (name) => documentEvents.delete(name) }
  globalThis.window = { localStorage: storage, sessionStorage, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: (name) => events.delete(name) }
  const h = hooks()
  const state = { session: options.session ?? null, assurance: { currentLevel: 'aal1', nextLevel: 'aal1' },
    factors: [], signOutResults: [], calls: [], providerCalls: [], navigations: [], ...options }
  let listener
  const emit = (event, session) => { state.session = session; listener(event, session) }
  const auth = {
    getSession: async () => {
      if (state.getSession) return state.getSession()
      return { data: { session: state.session }, error: state.sessionError ?? null }
    },
    onAuthStateChange: (fn) => { listener = fn; return { data: { subscription: { unsubscribe() {} } } } },
    signInWithPassword: async (payload) => {
      state.calls.push(['login', payload])
      if (state.login) return state.login()
      if (state.loginError) return { data: {}, error: state.loginError }
      emit('SIGNED_IN', sessionFor())
      return { data: { user: alice, session: state.session }, error: null }
    },
    signUp: async () => {
      if (state.confirmEmail) return { data: { user: alice, session: null }, error: null }
      emit('SIGNED_IN', sessionFor())
      return { data: { user: alice, session: state.session }, error: null }
    },
    signOut: async ({ scope }) => {
      state.calls.push(['logout', scope])
      const result = state.signOutResults.shift()
      if (typeof result === 'function') return result()
      if (result instanceof Error) throw result
      if (result?.error) return result
      emit('SIGNED_OUT', null)
      return { error: null }
    },
    mfa: {
      getAuthenticatorAssuranceLevel: async (token) => {
        if (state.checkMfa) return state.checkMfa(token)
        return { data: state.assurance, error: state.mfaError ?? null }
      },
      listFactors: async () => ({ data: { totp: state.factors }, error: state.factorError ?? null }),
      challenge: async () => ({ data: { id: 'challenge' }, error: state.challengeError ?? null }),
      verify: async () => {
        if (state.verifyError) return { error: state.verifyError }
        if (!state.noAssuranceUpgrade) {
          state.assurance = { currentLevel: 'aal2', nextLevel: 'aal2' }
          state.session = { ...state.session, access_token: `${state.session.access_token}-aal2` }
        }
        emit('MFA_CHALLENGE_VERIFIED', state.session)
        return { data: state.session, error: null }
      },
    },
  }
  const { AuthProvider } = loadTs('src/auth/AuthContext.tsx', {
    react: { ...h.react, createContext: () => ({ Provider: 'Provider' }), useContext() {} },
    'react-router-dom': { useNavigate: () => (...args) => state.navigations.push(args) },
    '../lib/supabase': { supabase: { auth }, isSupabaseConfigured: true },
    '../lib/supabaseData': {
      loadProvider: async (id) => { state.providerCalls.push(id); return state.loadProvider ? state.loadProvider(id) : { id, email: id === alice.id ? alice.email : bob.email } },
      updateProvider: async () => {},
    },
  })
  const render = () => h.render(() => AuthProvider({ children: null }))
  render()
  t[cleanupKey].push(h)
  return { state, auth, emit, storage, sessionStorage, events, documentEvents, value: () => h.flush().props.value }
}

function protectedResult(value) {
  const { ProtectedRoute } = loadTs('src/components/ProtectedRoute.tsx', {
    '../auth/AuthContext': { useAuth: () => value },
    'react-router-dom': { Navigate: 'Navigate', Outlet: 'Outlet', useLocation: () => ({ pathname: '/dashboard/routines' }) },
    '@mui/material': { Box: 'Box', CircularProgress: 'Spinner' },
  })
  return ProtectedRoute()
}
const denied = (h) => assert.notEqual(protectedResult(h.value()).type, 'Outlet')
const login = (h) => h.value().login(' alice@example.invalid ', 'synthetic-password')


export { harness, protectedResult, denied, login, alice, bob, sessionFor, settle };
