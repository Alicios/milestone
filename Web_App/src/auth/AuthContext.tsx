import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { EditableUserFields, User } from '../types'
import { supabase } from '../lib/supabase'
import { loadProvider, updateProvider } from '../lib/supabaseData'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (details: RegisterDetails) => Promise<void>
  logout: () => void
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
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    async function restoreSession() {
      const { data, error } = await supabase.auth.getSession()
      if (error) console.error(error)
      if (active && data.session) {
        try { setUser(await loadProvider(data.session.user.id, data.session.user.email ?? '')) }
        catch (providerError) { console.error(providerError) }
      }
      if (active) setLoading(false)
    }
    void restoreSession()
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setUser(null)
      if (event === 'SIGNED_IN' && session) void loadProvider(session.user.id, session.user.email ?? '').then(setUser).catch(console.error)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    login: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      if (!data.user) throw new Error('Supabase did not return a signed-in user.')
      setUser(await loadProvider(data.user.id, data.user.email ?? email))
    },
    register: async ({ name, email, password, specialty }) => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: name.trim(), specialty: specialty.trim(), role: 'Physical Therapist' } },
      })
      if (error) throw error
      if (!data.user || !data.session) throw new Error('Account created. Confirm your email before signing in.')
      setUser(await loadProvider(data.user.id, data.user.email ?? email))
    },
    logout: () => {
      void supabase.auth.signOut()
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
