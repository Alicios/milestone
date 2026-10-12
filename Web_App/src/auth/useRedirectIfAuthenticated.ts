import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

/** Sends an already-authenticated visitor to the dashboard instead of leaving
 * them on a public page (e.g. right after a Supabase email-confirmation redirect
 * lands them on "/"). */
export function useRedirectIfAuthenticated(target = '/dashboard') {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && user) navigate(target, { replace: true })
  }, [loading, user, navigate, target])
}
