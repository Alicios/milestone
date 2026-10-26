// UI denial only: Supabase still owns sessions and server-side token enforcement.
// Keep the logout intent across reloads if the SDK cannot remove its session.
export const logoutStateKey = 'milestone.auth.logout'
export type LogoutState = 'pending' | 'global' | 'local' | 'failed'

export function readLogoutState(): LogoutState | null {
  if (typeof window === 'undefined') return null
  let unreadable = false
  let result: LogoutState | null = null
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    try {
      const value = window[name].getItem(logoutStateKey)
      if (value !== null) {
        const state = value === 'global' || value === 'local' ? value : 'failed'
        if (result === null || state === 'failed') result = state
      }
    } catch { unreadable = true }
  }
  return result ?? (unreadable ? 'failed' : null)
}

export function saveLogoutState(state: LogoutState): boolean {
  let persisted = false
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    try {
      window[name].setItem(logoutStateKey, state)
      persisted = window[name].getItem(logoutStateKey) === state || persisted
    } catch { /* Try the other store. The caller must report total failure. */ }
  }
  return persisted
}

// Only call after a successful fresh authentication, never during restoration.
export function clearLogoutState(): boolean {
  if (typeof window === 'undefined') return true
  let cleared = true
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    try {
      if (window[name].getItem(logoutStateKey) !== null) window[name].removeItem(logoutStateKey)
      if (window[name].getItem(logoutStateKey) !== null) cleared = false
    } catch { cleared = false }
  }
  return cleared
}
