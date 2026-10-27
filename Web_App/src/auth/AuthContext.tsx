import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { sameCredentials, sameSession, sessionUnexpired } from './session'
import { useNavigate } from 'react-router-dom'
import type { EditableUserFields, User } from '../types'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { loadProvider, updateProvider } from '../lib/supabaseData'
import { AuthenticationCheckError, getVerifiedTotpFactorId, needsMfaChallenge } from './mfa'
import { clearLogoutState, logoutStateKey, readLogoutState, saveLogoutState, type LogoutState } from './logoutState'

export type LoginResult = { status: 'signed-in' } | { status: 'mfa-required' }

interface AuthContextValue {
  user: User | null
  loading: boolean
  authError: string
  logoutState: LogoutState | null
  mfaChallengePending: boolean
  login: (email: string, password: string) => Promise<LoginResult>
  verifyMfaLogin: (code: string) => Promise<void>
  cancelMfaLogin: () => Promise<void>
  register: (details: RegisterDetails) => Promise<void>
  logout: () => Promise<void>
  updateProfile: (profile: Partial<EditableUserFields>) => Promise<void>
}

export interface RegisterDetails {
  name: string
  email: string
  password: string
  confirmPassword: string
  medicalPracticeId: string
}

type MfaOperation = { request: number; expected: Session; verifying: boolean; verifiedEvent: Session | null; invalidated: boolean }
type CredentialOperation = { request: number; signedIn: Session | null; responseChecked: boolean; invalidated: boolean }
const AuthContext = createContext<AuthContextValue | undefined>(undefined)
const sessionError = 'Your session could not be verified. Please sign in again.'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [authError, setAuthError] = useState('')
  const [logoutState, setLogoutState] = useState(readLogoutState)
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
  const mfaSession = useRef<Session | null>(null)
  const mfaOperation = useRef<MfaOperation | null>(null)
  const credentialOperation = useRef<CredentialOperation | null>(null)
  const verified = useRef<{ session: Session; provider: User } | null>(null)
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigate = useNavigate()
  // One generation covers SDK callbacks, explicit authentication, and logout.
  const authGeneration = useRef(0)
  const mounted = useRef(true)
  const blocked = useRef(logoutState !== null)
  const interactive = useRef<number | null>(null)
  const logoutPending = useRef<Promise<void> | null>(null)
  const current = (request: number) => mounted.current && request === authGeneration.current
  const assertCurrent = (request: number) => {
    if (!current(request) || blocked.current) throw new AuthenticationCheckError('Authentication changed. Please sign in again.')
  }
  const stopExpiryTimer = () => {
    if (expiryTimer.current !== null) clearTimeout(expiryTimer.current)
    expiryTimer.current = null
  }
  const clearUser = () => {
    stopExpiryTimer(); verified.current = null
    setUser(null); setMfaFactorId(null); mfaSession.current = null
  }
  const fail = (request: number, error: unknown, fallback = sessionError) => {
    const message = error instanceof AuthenticationCheckError ? error.message : fallback
    if (current(request)) {
      blocked.current = true
      stopExpiryTimer(); verified.current = null; setUser(null)
      setAuthError(message)
      setLoading(false)
    }
    return new AuthenticationCheckError(message)
  }
  const checkSession = async (expected: Session, request: number) => {
    const { data, error } = await supabase.auth.getSession()
    assertCurrent(request)
    if (error || !sessionUnexpired(data.session) || !sameSession(data.session, expected)) {
      if (mfaOperation.current) invalidateMfa(mfaOperation.current)
      if (credentialOperation.current) invalidateCredentials(credentialOperation.current)
      throw new AuthenticationCheckError(sessionError)
    }
  }
  const persistenceError = 'Protected access is blocked in this tab. Logout protection could not be saved; reloading may restore a remaining session. Retry sign-out before closing this tab.'

  function invalidateMfa(operation: MfaOperation) {
    if (operation.invalidated) return
    operation.invalidated = true
    ++authGeneration.current; blocked.current = true
    clearUser(); setLoading(false)
    const durable = saveLogoutState('failed')
    setLogoutState('failed')
    setAuthError(durable ? 'Authentication changed during MFA verification. Please sign in again.' : persistenceError)
    // Keep the interactive guard until the SDK request AND local cleanup settle.
  }

  function invalidateCredentials(operation: CredentialOperation) {
    if (operation.invalidated) return
    operation.invalidated = true
    ++authGeneration.current; blocked.current = true
    clearUser(); setLoading(false)
    const durable = saveLogoutState('failed')
    setLogoutState('failed')
    setAuthError(durable ? 'Authentication changed. Please sign in again.' : persistenceError)
    // The SDK can still save its response. Keep the guard until it settles and
    // local cleanup is verified; no new login may race that cleanup.
  }

  function checkCredentialResponse(session: Session | null, request: number) {
    assertCurrent(request)
    const operation = credentialOperation.current
    if (!operation || operation.request !== request) throw new AuthenticationCheckError(sessionError)
    // The SDK emits SIGNED_IN before returning. One matching candidate is ours;
    // an unrelated event cannot be accepted just because it arrived first.
    if ((session || operation.signedIn) && !sameSession(session, operation.signedIn)) {
      invalidateCredentials(operation)
      assertCurrent(request)
    }
    operation.responseChecked = true
  }

  async function discardCredentialResponse() {
    try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* Verify removal below, including thrown storage errors. */ }
    try {
      const { data, error } = await supabase.auth.getSession()
      if (!error && !data.session) return
    } catch { /* Unverifiable removal must not be reported as successful. */ }
    const durable = saveLogoutState('failed')
    setLogoutState('failed')
    const message = 'Authentication changed. The browser session could not be cleared. Protected access is blocked. Retry sign-out.'
    setAuthError(durable ? message : `${message} ${persistenceError}`)
  }

  async function resolveSession(session: Session, request: number, fresh = false, requireVerifiedMfa = false): Promise<LoginResult> {
    assertCurrent(request)
    await checkSession(session, request)
    const challengeRequired = await needsMfaChallenge(session, requireVerifiedMfa)
    assertCurrent(request)
    if (challengeRequired) {
      const factorId = await getVerifiedTotpFactorId()
      await checkSession(session, request)
      clearUser(); setMfaFactorId(factorId); mfaSession.current = session
      setAuthError(''); setLoading(false)
      return { status: 'mfa-required' }
    }
    const next = verified.current?.provider.id === session.user.id
      ? verified.current.provider : await loadProvider(session.user.id, session.user.email ?? '')
    await checkSession(session, request)
    if (fresh && !clearLogoutState()) throw new AuthenticationCheckError('Authentication succeeded, but the logout block could not be cleared. Please retry signing in.')
    if (!fresh && readLogoutState() !== null) throw new AuthenticationCheckError(sessionError)
    verified.current = { session, provider: next }
    setLogoutState(null); setAuthError(''); setMfaFactorId(null); mfaSession.current = null
    setUser(next); setLoading(false)
    armExpiryTimer(session)
    return { status: 'signed-in' }
  }

  function armExpiryTimer(session: Session) {
    stopExpiryTimer()
    // Long-lived synthetic sessions and unusual server settings must not overflow setTimeout.
    expiryTimer.current = setTimeout(() => {
      expiryTimer.current = null
      if (!sessionUnexpired(session)) revalidate()
      else armExpiryTimer(session)
    }, Math.min(Math.max(0, session.expires_at! * 1000 - Date.now()), 2_147_483_647))
  }

  function revalidate() {
    if (!mounted.current || blocked.current || interactive.current !== null || logoutPending.current) return
    const previous = verified.current
    const request = ++authGeneration.current
    if (!sessionUnexpired(previous?.session ?? null)) { clearUser(); setLoading(true) }
    void (async () => {
      const { data, error } = await supabase.auth.getSession()
      assertCurrent(request)
      if (error || !data.session) throw new AuthenticationCheckError(sessionError)
      if (previous && sameSession(previous.session, data.session) && sessionUnexpired(previous.session)) return
      if (previous && !sameSession(previous.session, data.session)) {
        // A silent storage/account replacement is not a routine SDK refresh event.
        clearUser(); setLoading(true)
      }
      await resolveSession(data.session, request)
    })().catch((error) => fail(request, error))
  }

  useEffect(() => {
    mounted.current = true
    const initialRequest = authGeneration.current
    async function restore() {
      try {
        if (blocked.current) { setLoading(false); return }
        const { data, error } = await supabase.auth.getSession()
        if (!current(initialRequest)) return
        if (error) throw new AuthenticationCheckError(sessionError)
        if (!data.session) { clearUser(); setLoading(false); return }
        await resolveSession(data.session, initialRequest)
      } catch (error) { fail(initialRequest, error) }
    }
    void restore()
    // Never await SDK calls inside its auth callback (SDK lock/deadlock boundary).
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted.current) return
      const operation = mfaOperation.current
      if (operation) {
        if (operation.invalidated) return
        if (event === 'MFA_CHALLENGE_VERIFIED' && operation.verifying && !operation.verifiedEvent
          && session?.user.id === operation.expected.user.id) {
          // The SDK emits before verify() returns. Accept only its matching response below.
          operation.verifiedEvent = session
        } else if (!sameSession(operation.expected, session) || event === 'SIGNED_OUT') invalidateMfa(operation)
        return
      }
      const credentials = credentialOperation.current
      if (credentials) {
        if (credentials.invalidated) return
        if (event === 'INITIAL_SESSION') return
        if (event === 'SIGNED_IN' && session) {
          if (!credentials.signedIn) { credentials.signedIn = session; return }
          if (sameSession(credentials.signedIn, session)) return
        }
        invalidateCredentials(credentials)
        return
      }
      if (logoutPending.current) return
      if (blocked.current || readLogoutState() !== null) return
      const previous = verified.current
      if (event === 'SIGNED_IN' && previous && sameSession(previous.session, session)
        && sessionUnexpired(previous.session)
        && JSON.stringify(previous.session.user.factors) === JSON.stringify(session?.user.factors)) return
      const request = ++authGeneration.current
      if (!session) { clearUser(); setLoading(false); return }
      const preserve = event === 'TOKEN_REFRESHED' && previous?.provider.id === session.user.id
        && sessionUnexpired(previous.session)
      if (!preserve) { clearUser(); setLoading(true) }
      setTimeout(() => {
        if (current(request)) void resolveSession(session, request).catch((error) => fail(request, error))
      }, 0)
    })
    const storageChanged = (event: StorageEvent) => {
      if (event.key !== logoutStateKey && event.key !== null) return
      const state = readLogoutState()
      if (state === null) return
      if (mfaOperation.current) invalidateMfa(mfaOperation.current)
      if (credentialOperation.current) invalidateCredentials(credentialOperation.current)
      ++authGeneration.current; blocked.current = true
      clearUser(); setLoading(false); setLogoutState(state)
    }
    const resumed = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') revalidate()
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', storageChanged)
      window.addEventListener('focus', resumed)
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', resumed)
    return () => {
      mounted.current = false; ++authGeneration.current; stopExpiryTimer()
      listener.subscription.unsubscribe()
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', storageChanged)
        window.removeEventListener('focus', resumed)
      }
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', resumed)
    }
  }, [])

  async function authenticate<T>(operation: (request: number) => Promise<T>, fallback: string, keepMfa = false): Promise<T> {
    if (logoutPending.current || interactive.current !== null) throw new AuthenticationCheckError('An authentication request is already in progress. Please wait.')
    const request = ++authGeneration.current
    interactive.current = request; blocked.current = false
    stopExpiryTimer(); verified.current = null; setUser(null); setAuthError(''); setLoading(true)
    if (!keepMfa) { setMfaFactorId(null); mfaSession.current = null }
    const credentials: CredentialOperation | null = keepMfa ? null
      : { request, signedIn: null, responseChecked: false, invalidated: false }
    try {
      if (!isSupabaseConfigured) throw new AuthenticationCheckError('Sign-in is unavailable because authentication is not configured.')
      if (credentials) credentialOperation.current = credentials
      return await operation(request)
    } catch (error) {
      // A thrown SDK/storage error may follow a partial session write.
      if (credentials && credentialOperation.current === credentials && !credentials.responseChecked) invalidateCredentials(credentials)
      throw fail(request, error, fallback)
    } finally {
      if (credentials && credentialOperation.current === credentials) {
        try {
          if (!current(request)) {
            invalidateCredentials(credentials)
            await discardCredentialResponse()
          }
        } finally {
          if (credentialOperation.current === credentials) credentialOperation.current = null
        }
      }
      if (interactive.current === request) interactive.current = null
      if (current(request)) setLoading(false)
    }
  }

  function logout(): Promise<void> {
    if (logoutPending.current) return logoutPending.current
    if (mfaOperation.current) invalidateMfa(mfaOperation.current)
    if (credentialOperation.current) invalidateCredentials(credentialOperation.current)
    ++authGeneration.current; blocked.current = true
    clearUser(); setAuthError(''); setLoading(false)
    setLogoutState('pending')
    let durable = saveLogoutState('pending')
    if (!durable) setAuthError(persistenceError)
    navigate('/login', { replace: true })
    const attempt = async (scope: 'global' | 'local') => {
      try { return !(await supabase.auth.signOut({ scope })).error } catch { return false }
    }
    // Defer execution until the single-flight guard is set, including synchronous SDK callbacks.
    const operation = Promise.resolve().then(async () => {
      const outcome: LogoutState = await attempt('global') ? 'global' : await attempt('local') ? 'local' : 'failed'
      durable = saveLogoutState(outcome) || durable
      if (mounted.current) {
        setLogoutState(outcome); setAuthError(durable ? '' : persistenceError)
        if (outcome === 'global' && durable) navigate('/', { replace: true })
      }
    }).finally(() => { logoutPending.current = null })
    logoutPending.current = operation
    return operation
  }

  const value: AuthContextValue = {
    user, loading, authError, logoutState,
    mfaChallengePending: mfaFactorId !== null,
    login: (email, password) => authenticate(async (request) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      checkCredentialResponse(data.session, request)
      if (error || !data.user || !data.session) throw new AuthenticationCheckError('Unable to sign in. Check your email and password and try again.')
      return resolveSession(data.session, request, true)
    }, 'Unable to sign in. Please try again.'),
    verifyMfaLogin: (code) => {
      const factorId = mfaFactorId; const expected = mfaSession.current
      return authenticate(async (request) => {
        if (!factorId || !expected) throw new AuthenticationCheckError('No MFA challenge is pending. Please sign in again.')
        const operation: MfaOperation = { request, expected, verifying: false, verifiedEvent: null, invalidated: false }
        mfaOperation.current = operation
        try {
          await checkSession(expected, request)
          const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
          await checkSession(expected, request)
          if (challengeError || !challenge) throw new AuthenticationCheckError('Unable to start MFA verification. Please try again.')
          operation.verifying = true
          const { data, error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code })
          assertCurrent(request)
          if (verifyError) throw new AuthenticationCheckError('Unable to verify your code. Please try again.')
          if (!data || data.user?.id !== expected.user.id || !sameCredentials(operation.verifiedEvent, data)) {
            invalidateMfa(operation)
            throw new AuthenticationCheckError('Authentication changed. Please sign in again.')
          }
          // MFA's response has expires_in, not expires_at. Use the SDK's persisted
          // session for its deadline, and ensure it still holds this exact response.
          const { data: active, error: sessionError } = await supabase.auth.getSession()
          assertCurrent(request)
          if (sessionError || !sessionUnexpired(active.session) || !sameCredentials(active.session, data)) {
            invalidateMfa(operation)
            throw new AuthenticationCheckError('Authentication changed. Please sign in again.')
          }
          await resolveSession(active.session, request, true, true)
        } finally {
          if (!current(request)) {
            // verify() may have saved stale tokens before returning. Keep all access blocked
            // and prevent a new interactive login until SDK local cleanup has settled.
            invalidateMfa(operation)
            try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* Durable denial remains; retry sign-out is available. */ }
          }
          if (mfaOperation.current === operation) mfaOperation.current = null
        }
      }, 'Unable to complete MFA verification. Please try again.', true)
    },
    cancelMfaLogin: logout,
    register: (details) => authenticate(async (request) => {
      const { name, email, password, medicalPracticeId } = details
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { data: { name: name.trim(), medical_practice_id: medicalPracticeId,
          professional_title: 'Physical Therapist', role: 'Physical Therapist' } },
      })
      checkCredentialResponse(data.session, request)
      if (error) throw new AuthenticationCheckError('Unable to create your account. Please try again.')
      if (!data.user || !data.session) throw new AuthenticationCheckError('Account created. Confirm your email before signing in.')
      await resolveSession(data.session, request, true)
    }, 'Unable to create your account. Please try again.'),
    logout,
    updateProfile: async (profile) => {
      const request = authGeneration.current
      const session = verified.current?.session
      if (!user || !session || blocked.current) return
      await checkSession(session, request)
      await updateProvider(user.id, { ...user, ...profile })
      assertCurrent(request)
      const next = await loadProvider(user.id, user.email)
      await checkSession(session, request)
      if (verified.current) verified.current.provider = next
      setUser(next)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
