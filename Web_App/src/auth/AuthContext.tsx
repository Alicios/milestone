import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { EditableUserFields, User } from '../types'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { loadProvider, updateProvider } from '../lib/supabaseData'
import { getVerifiedTotpFactorId, needsMfaChallenge } from './mfa'

export type LoginResult = { status: 'signed-in' } | { status: 'mfa-required' }

interface AuthContextValue {
  user: User | null
  loading: boolean
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

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let active = true

    async function applySession(sessionUser: { id: string; email?: string } | null) {
      if (!sessionUser) {
        if (active) { setUser(null); setMfaFactorId(null); setLoading(false) }
        return
      }
      try {
        // A verified TOTP factor means this session (aal1) still owes a
        // challenge before it's treated as fully signed in. This runs on
        // every session restore too, so a refresh mid-challenge re-asks
        // instead of granting access.
        if (await needsMfaChallenge()) {
          const factorId = await getVerifiedTotpFactorId()
          if (active) { setUser(null); setMfaFactorId(factorId); setLoading(false) }
          return
        }
        const next = await loadProvider(sessionUser.id, sessionUser.email ?? '')
        if (active) { setUser(next); setMfaFactorId(null); setLoading(false) }
      } catch (error) {
        console.error(error)
        if (active) setLoading(false)
      }
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error(error)
      void applySession(data.session?.user ?? null)
    })
    // Defer the provider query out of the auth callback to avoid deadlocking supabase-js.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => { void applySession(session?.user ?? null) }, 0)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    mfaChallengePending: mfaFactorId !== null,
    login: async (email, password) => {
      if (!isSupabaseConfigured) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.')
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
      if (!data.user) throw new Error('Supabase did not return a signed-in user.')
      if (await needsMfaChallenge()) {
        setMfaFactorId(await getVerifiedTotpFactorId())
        return { status: 'mfa-required' }
      }
      setUser(await loadProvider(data.user.id, data.user.email ?? email))
      return { status: 'signed-in' }
    },
    verifyMfaLogin: async (code) => {
      if (!mfaFactorId) throw new Error('No MFA challenge is pending.')
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId })
      if (challengeError) throw challengeError
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: mfaFactorId, challengeId: challenge.id, code })
      if (verifyError) throw verifyError
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!userData.user) throw new Error('Supabase did not return a signed-in user after verification.')
      setUser(await loadProvider(userData.user.id, userData.user.email ?? ''))
      setMfaFactorId(null)
    },
    cancelMfaLogin: async () => {
      await supabase.auth.signOut()
      setUser(null)
      setMfaFactorId(null)
    },
    register: async ({ name, email, password, medicalPracticeId }) => {
      if (!isSupabaseConfigured) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.')
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            name: name.trim(),
            medical_practice_id: medicalPracticeId,
            professional_title: 'Physical Therapist',
            role: 'Physical Therapist',
          },
        },
      })
      if (error) throw error
      if (!data.user || !data.session) throw new Error('Account created. Confirm your email before signing in.')
      setUser(await loadProvider(data.user.id, data.user.email ?? email))
    },
    logout: async () => {
      await supabase.auth.signOut()
      setUser(null)
      setMfaFactorId(null)
      navigate('/', { replace: true })
    },
    updateProfile: async (profile) => {
      if (!user) return
      await updateProvider(user.id, { ...user, ...profile })
      setUser(await loadProvider(user.id, user.email))
    },
  }), [loading, mfaFactorId, navigate, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
