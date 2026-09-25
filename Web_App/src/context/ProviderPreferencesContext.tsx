import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export interface NotificationPreferences {
  newMessages: boolean
  routineUpdates: boolean
  appointments: boolean
  patientAlerts: boolean
  inApp: boolean
  email: boolean
}

export interface AlertPreferences {
  missedRoutines: boolean
  patientConcerns: boolean
  appointmentChanges: boolean
  priorityMessages: boolean
}

export interface ProviderPreferences {
  theme: ThemePreference
  notifications: NotificationPreferences
  alerts: AlertPreferences
}

export type ProviderPreferencesUpdate = {
  theme?: ThemePreference
  notifications?: Partial<NotificationPreferences>
  alerts?: Partial<AlertPreferences>
}

interface ProviderPreferencesContextValue {
  preferences: ProviderPreferences
  resolvedTheme: ResolvedTheme
  updatePreferences: (updates: ProviderPreferencesUpdate) => void
  resetPreferences: () => void
}

const defaultPreferences: ProviderPreferences = {
  theme: 'light',
  notifications: {
    newMessages: true,
    routineUpdates: true,
    appointments: true,
    patientAlerts: true,
    inApp: true,
    email: true,
  },
  alerts: {
    missedRoutines: true,
    patientConcerns: true,
    appointmentChanges: true,
    priorityMessages: true,
  },
}

function createDefaultPreferences(): ProviderPreferences {
  return {
    theme: defaultPreferences.theme,
    notifications: { ...defaultPreferences.notifications },
    alerts: { ...defaultPreferences.alerts },
  }
}

const ProviderPreferencesContext = createContext<ProviderPreferencesContextValue | undefined>(undefined)

export function ProviderPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<ProviderPreferences>(createDefaultPreferences)
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>('light')

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemTheme = () => setSystemTheme(mediaQuery.matches ? 'dark' : 'light')
    updateSystemTheme()
    mediaQuery.addEventListener('change', updateSystemTheme)
    return () => mediaQuery.removeEventListener('change', updateSystemTheme)
  }, [])

  const updatePreferences = useCallback((updates: ProviderPreferencesUpdate) => {
    setPreferences((current) => ({
      ...current,
      ...updates,
      notifications: updates.notifications ? { ...current.notifications, ...updates.notifications } : current.notifications,
      alerts: updates.alerts ? { ...current.alerts, ...updates.alerts } : current.alerts,
    }))
  }, [])

  const resetPreferences = useCallback(() => setPreferences(createDefaultPreferences()), [])
  const resolvedTheme: ResolvedTheme = preferences.theme === 'system' ? systemTheme : preferences.theme
  const value = useMemo(() => ({ preferences, resolvedTheme, updatePreferences, resetPreferences }), [preferences, resolvedTheme, updatePreferences, resetPreferences])

  return <ProviderPreferencesContext.Provider value={value}>{children}</ProviderPreferencesContext.Provider>
}

export function useProviderPreferences() {
  const context = useContext(ProviderPreferencesContext)
  if (!context) throw new Error('useProviderPreferences must be used inside ProviderPreferencesProvider')
  return context
}
