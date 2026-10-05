import { Avatar, useTheme } from '@mui/material'

export function getPatientInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return `${parts[0].charAt(0)}${parts.at(-1)?.charAt(0) ?? ''}`.toUpperCase()
}

export function PatientAvatar({ name, size = 'compact' }: { name: string; size?: 'compact' | 'large' }) {
  const theme = useTheme()
  const dimensions = size === 'large' ? { xs: 68, sm: 88 } : { xs: 44, sm: 52 }
  const labelName = name.trim() || 'Patient'

  return <Avatar
    role="img"
    aria-label={`${labelName} profile picture placeholder`}
    sx={{
      width: dimensions,
      height: dimensions,
      flexShrink: 0,
      bgcolor: theme.palette.mode === 'dark' ? '#376f78' : '#4b9da9',
      color: 'white',
      border: `3px solid ${theme.palette.divider}`,
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
      fontWeight: 700,
      fontSize: size === 'large' ? { xs: '1.5rem', sm: '2rem' } : { xs: '1rem', sm: '1.2rem' },
    }}
  >
    {getPatientInitials(name)}
  </Avatar>
}
