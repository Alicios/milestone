import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import { Box, Button, Card, Divider, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const teal = '#4b9da9'
const aqua = '#91c8c0'
const fontSx = { fontFamily: 'Georgia, serif' }
const headingSx = { ...fontSx, fontStyle: 'italic' }
const buttonSx = { ...headingSx, color: 'black', border: '3px solid black', borderRadius: '20px', px: 3 }

export function SettingsPage() {
  const { user, logout } = useAuth()

  if (!user) return null

  return (
    <Box maxWidth={900} mx="auto" py={{ xs: 1, md: 3 }}>
      <Button component={RouterLink} to="/dashboard" startIcon={<ArrowBackIcon />} sx={{ ...headingSx, color: 'black', mb: 2, fontSize: '1.1rem' }}>Back to Dashboard</Button>
      <Stack direction="row" spacing={2} alignItems="center" mb={3}>
        <Box sx={{ width: 68, height: 68, flexShrink: 0, borderRadius: '50%', bgcolor: teal, border: '4px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <SettingsOutlinedIcon sx={{ color: 'white', fontSize: 40 }} />
        </Box>
        <Box>
          <Typography component="h1" variant="h3" sx={{ ...headingSx, fontSize: { xs: '2.1rem', sm: '3rem' } }}>Settings</Typography>
          <Typography sx={{ ...fontSx, fontSize: '1.1rem' }}>Your account and application preferences.</Typography>
        </Box>
      </Stack>

      <Card component="section" aria-labelledby="settings-account-heading" sx={{ border: '4px solid black', borderRadius: '30px', bgcolor: 'white', color: 'black', overflow: 'hidden' }}>
        <Box sx={{ px: { xs: 2.5, sm: 4 }, py: 2, bgcolor: aqua, borderBottom: '3px solid black' }}>
          <Typography id="settings-account-heading" component="h2" variant="h5" sx={{ ...headingSx, fontWeight: 700 }}>Account</Typography>
        </Box>
        <Stack spacing={3} divider={<Divider />} sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Box>
            <Box component="dl" sx={{ m: 0 }}>
              <Typography component="dt" sx={{ ...fontSx, fontWeight: 700, mb: .75 }}>Provider ID</Typography>
              <Typography component="dd" sx={{ ...fontSx, m: 0, overflowWrap: 'anywhere' }}>{user.id}</Typography>
            </Box>
            <Typography variant="body2" sx={{ ...fontSx, mt: 1, color: 'text.secondary' }}>Contact an administrator to change this.</Typography>
          </Box>
          <Box>
            <Typography sx={{ ...fontSx, mb: 1 }}>Manage your photo, personal information, workplace, and contact details in your profile.</Typography>
            <Button component={RouterLink} to="/dashboard/profile" endIcon={<ArrowForwardIcon />} sx={{ ...headingSx, color: 'black', px: 0 }}>Go to Profile</Button>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
            <Typography sx={fontSx}>Sign out of your current session.</Typography>
            <Button type="button" onClick={logout} startIcon={<LogoutOutlinedIcon />} sx={{ ...buttonSx, flexShrink: 0 }}>Sign Out</Button>
          </Stack>
        </Stack>
      </Card>
      <Typography variant="body2" sx={{ ...fontSx, mt: 2, px: 1, color: 'text.secondary' }}>
        Notification, appearance, privacy, and security preferences are not available yet.
      </Typography>
    </Box>
  )
}
