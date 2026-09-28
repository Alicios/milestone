import { Stack, SvgIcon, Typography } from '@mui/material'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import type { MouseEvent } from 'react'

export function Brand({ light = false }: { light?: boolean }) {
  const location = useLocation()

  const handleBrandClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (location.pathname !== '/') return
    event.preventDefault()
    window.history.replaceState(null, '', '/')
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  return (
    <Stack component={RouterLink} to="/" onClick={handleBrandClick} direction="row" spacing={1.1} alignItems="center" aria-label="Milestone home" sx={{ color: 'inherit', textDecoration: 'none' }}>
      <MilestoneMark light={light} />
      <Typography variant="h6" fontWeight={800} letterSpacing="-.035em" color={light ? 'inherit' : 'primary.dark'}>Milestone</Typography>
    </Stack>
  )
}

function MilestoneMark({ light }: { light: boolean }) {
  return <SvgIcon viewBox="0 0 48 48" fontSize="large" sx={{ color: light ? 'inherit' : 'primary.dark', fontSize: { xs: 32, sm: 38 } }} titleAccess="Milestone logo">
    <path fill="currentColor" d="M24 4C12.954 4 4 12.954 4 24s8.954 20 20 20 20-8.954 20-20S35.046 4 24 4Zm0 4c8.837 0 16 7.163 16 16 0 2.105-.406 4.115-1.144 5.953l-5.3-2.367A10.005 10.005 0 0 0 34 24c0-5.523-4.477-10-10-10s-10 4.477-10 10c0 1.25.23 2.446.65 3.55l-5.282 2.361A15.938 15.938 0 0 1 8 24C8 15.163 15.163 8 24 8Z" />
    <path fill="currentColor" d="M16.164 29.82A9.98 9.98 0 0 0 24 34a9.98 9.98 0 0 0 7.836-4.18l-3.278-1.465A6.003 6.003 0 0 1 24 30a6.003 6.003 0 0 1-4.558-1.645l-3.278 1.465Z" />
    <path fill="#d9822b" d="M22 18h4v4h4v4h-4v4h-4v-4h-4v-4h4v-4Z" />
  </SvgIcon>
}
