import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { loadOnboardingDetails, loadOnboardingStatuses } from '../lib/patientOnboarding'

function useRefreshable<T>(key: string | undefined, load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const live = useRef(false)
  const refresh = useCallback(async () => {
    const request = ++generation.current
    try {
      const next = await load()
      if (live.current && generation.current === request) { setData(next); setError('') }
    } catch (failure) {
      if (live.current && generation.current === request) {
        setData(null); setError(failure instanceof Error ? failure.message : 'Patient setup could not be loaded.')
      }
    } finally { if (live.current && generation.current === request) setLoading(false) }
  }, [load])
  useEffect(() => {
    live.current = true
    setData(null); setError(''); setLoading(true)
    if (!key) { setLoading(false); return () => { live.current = false; ++generation.current } }
    void refresh()
    const visibleRefresh = () => { if (document.visibilityState === 'visible') void refresh() }
    window.addEventListener('focus', visibleRefresh)
    document.addEventListener('visibilitychange', visibleRefresh)
    const timer = window.setInterval(visibleRefresh, 30000)
    return () => {
      live.current = false; ++generation.current
      window.clearInterval(timer)
      window.removeEventListener('focus', visibleRefresh)
      document.removeEventListener('visibilitychange', visibleRefresh)
    }
  }, [key, refresh])
  return { data, loading, error, refresh }
}
export function usePatientOnboardingStatuses() {
  const { user } = useAuth()
  return useRefreshable(user?.id, loadOnboardingStatuses)
}
export function usePatientOnboardingDetails(patientId: string) {
  const { user } = useAuth()
  const load = useCallback(() => loadOnboardingDetails(patientId), [patientId])
  return useRefreshable(user ? `${user.id}/${patientId}` : undefined, load)
}
