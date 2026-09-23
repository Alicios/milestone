import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '../types'

const demoUser: User = {
  id: 'provider-001',
  name: 'Lebron James',
  email: 'lebron.james@milestone.example',
  role: 'Physical Therapist',
  initials: 'LBJ',
}

interface AuthContextValue {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const navigate = useNavigate()

  const value = useMemo<AuthContextValue>(() => ({
    user,
    login: async (email, password) => {
      await new Promise((resolve) => setTimeout(resolve, 500))
      if (password.length < 6) throw new Error('For this demo, use a password with at least 6 characters.')
      setUser({ ...demoUser, email: email || demoUser.email })
    },
    logout: () => {
      setUser(null)
      navigate('/', { replace: true })
    },
  }), [navigate, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
