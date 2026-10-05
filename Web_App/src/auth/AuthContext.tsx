import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Session, User as SupabaseUser } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { User } from '../types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('')
}

async function loadUser(authUser: SupabaseUser): Promise<User> {
  const { data } = await supabase.from('profiles').select('name, role, initials').eq('id', authUser.id).maybeSingle()
  const email = authUser.email ?? ''
  const name = data?.name || email.split('@')[0]
  return { id: authUser.id, email, name, role: data?.role || 'Physical Therapist', initials: data?.initials || initialsFor(name) }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let active = true

    async function apply(session: Session | null) {
      const next = session?.user ? await loadUser(session.user) : null
      if (active) { setUser(next); setLoading(false) }
    }

    supabase.auth.getSession().then(({ data }) => apply(data.session))
    // Defer the profile query out of the callback to avoid deadlocking supabase-js.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { setTimeout(() => apply(session), 0) })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    login: async (email, password) => {
      if (!isSupabaseConfigured) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.')
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw new Error(error.message)
      // Set the user before returning so navigation to a protected route doesn't bounce back to /login.
      if (data.user) setUser(await loadUser(data.user))
    },
    logout: async () => {
      await supabase.auth.signOut()
      setUser(null)
      navigate('/', { replace: true })
    },
  }), [loading, navigate, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
