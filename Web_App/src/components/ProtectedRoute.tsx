import { Box, CircularProgress } from '@mui/material'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function ProtectedRoute() {
  const { user, loading, authError, mfaChallengePending, logoutState } = useAuth()
  const location = useLocation()
  if (loading) return <Box minHeight="100dvh" display="flex" alignItems="center" justifyContent="center"><CircularProgress /></Box>
  return user && !authError && !mfaChallengePending && !logoutState ? <Outlet /> : <Navigate to="/login" replace state={{ from: location.pathname }} />
}
