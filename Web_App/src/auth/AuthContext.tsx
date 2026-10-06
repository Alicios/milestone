import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { EditableUserFields, User } from '../types'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { loadProvider, updateProvider } from '../lib/supabaseData'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (details: RegisterDetails) => Promise<void>
  logout: () => Promise<void>
  updateProfile: (profile: Partial<EditableUserFields>) => Promise<void>
}

export interface RegisterDetails {
  name: string
  email: string
  password: string
  confirmPassword: string
  specialty: string
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let active = true

    async function applySession(sessionUser: { id: string; email?: string } | null) {
      if (!sessionUser) {
        if (active) { setUser(null); setLoading(false) }
        return
      }
      try {
        const next = await loadProvider(sessionUser.id, sessionUser.email ?? '')
        if (active) { setUser(next); setLoading(false) }
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
    login: async (email, password) => {
      if (!isSupabaseConfigured) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.')
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
      if (!data.user) throw new Error('Supabase did not return a signed-in user.')
      setUser(await loadProvider(data.user.id, data.user.email ?? email))
    },
    register: async ({ name, email, password, specialty }) => {
      if (!isSupabaseConfigured) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.')
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            name: name.trim(),
            specialty: specialty.trim(),
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
      navigate('/', { replace: true })
    },
    updateProfile: async (profile) => {
      if (!user) return
      await updateProvider(user.id, { ...user, ...profile })
      setUser(await loadProvider(user.id, user.email))
    },
  }), [loading, navigate, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
