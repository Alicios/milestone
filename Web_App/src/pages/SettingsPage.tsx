import type { ReactNode } from 'react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined'
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined'
import { Alert, Box, Button, Card, Divider, FormControl, FormControlLabel, FormLabel, Radio, RadioGroup, Stack, Switch, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { type AlertPreferences, type NotificationPreferences, useProviderPreferences } from '../context/ProviderPreferencesContext'

type NotificationCategory = Exclude<keyof NotificationPreferences, 'inApp' | 'email'>
type AlertCategory = keyof AlertPreferences

const notificationOptions: { key: NotificationCategory; label: string; description: string }[] = [
  { key: 'newMessages', label: 'New patient messages', description: 'Know when a patient sends a new message.' },
  { key: 'routineUpdates', label: 'Routine updates', description: 'Get updates when patients complete or miss assigned routines.' },
  { key: 'appointments', label: 'Appointments', description: 'Receive reminders and changes to scheduled visits.' },
  { key: 'patientAlerts', label: 'Patient updates', description: 'Receive general updates related to your patients’ care.' },
]

const alertOptions: { key: AlertCategory; label: string; description: string }[] = [
  { key: 'missedRoutines', label: 'Missed routines', description: 'Highlight when a patient misses an assigned routine.' },
  { key: 'patientConcerns', label: 'Patient-reported concerns', description: 'Highlight pain, symptoms, or other care concerns.' },
  { key: 'appointmentChanges', label: 'Appointment changes', description: 'Highlight cancellations, reschedules, and visit changes.' },
  { key: 'priorityMessages', label: 'Priority messages', description: 'Highlight messages that need your attention.' },
]

function SettingsSection({ id, icon, title, description, children }: { id: string; icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return <Card component="section" aria-labelledby={`${id}-heading`} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper', overflow: 'hidden' }}>
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box sx={{ width: 40, height: 40, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'primary.contrastText', flexShrink: 0 }}>{icon}</Box>
        <Box minWidth={0}><Typography id={`${id}-heading`} component="h2" variant="h6">{title}</Typography><Typography color="text.secondary" variant="body2">{description}</Typography></Box>
      </Stack>
    </Box>
    <Box sx={{ p: { xs: 2, sm: 3 } }}>{children}</Box>
  </Card>
}

function PreferenceSwitch({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <FormControlLabel
    labelPlacement="start"
    control={<Switch checked={checked} onChange={(event) => onChange(event.target.checked)} inputProps={{ 'aria-label': label }} />}
    label={<Box><Typography fontWeight={700}>{label}</Typography><Typography color="text.secondary" variant="body2">{description}</Typography></Box>}
    sx={{ m: 0, width: '100%', justifyContent: 'space-between', gap: 2, alignItems: 'center' }}
  />
}

export function SettingsPage() {
  const { user, logout } = useAuth()
  const { preferences, updatePreferences, resetPreferences } = useProviderPreferences()

  if (!user) return null

  return <Box maxWidth={980} mx="auto" py={{ xs: 1.5, md: 3 }}>
    <Button component={RouterLink} to="/dashboard" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>Back to Dashboard</Button>
    <Stack direction="row" spacing={2} alignItems="center" mb={1}>
      <Box sx={{ width: 56, height: 56, flexShrink: 0, borderRadius: 2, bgcolor: 'primary.main', color: 'primary.contrastText', display: 'grid', placeItems: 'center' }}><SettingsOutlinedIcon fontSize="large" /></Box>
      <Box><Typography component="h1" variant="h3" sx={{ fontSize: { xs: '2rem', sm: '2.7rem' } }}>Provider Settings</Typography><Typography color="text.secondary">Manage your account, notifications, alerts, and appearance.</Typography></Box>
    </Stack>
    <Alert severity="info" role="status" sx={{ my: 2 }}>Changes apply immediately for this session. They are not connected to a backend yet.</Alert>

    <Stack spacing={2.5}>
      <SettingsSection id="settings-account" icon={<SettingsOutlinedIcon />} title="Account" description="Your provider account and session controls.">
        <Stack spacing={2.5} divider={<Divider />}>
          <Box><Typography variant="subtitle2" color="text.secondary">Provider ID</Typography><Typography sx={{ overflowWrap: 'anywhere' }}>{user.id}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Contact an administrator to change this.</Typography></Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between">
            <Box><Typography fontWeight={700}>Profile information</Typography><Typography variant="body2" color="text.secondary">Manage your professional details and contact information in your profile.</Typography></Box>
            <Button component={RouterLink} to="/dashboard/profile" variant="outlined" sx={{ flexShrink: 0 }}>Go to Profile</Button>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between">
            <Box><Typography fontWeight={700}>Current session</Typography><Typography variant="body2" color="text.secondary">Sign out of this provider session.</Typography></Box>
            <Button type="button" onClick={logout} variant="contained" color="secondary" startIcon={<LogoutOutlinedIcon />} sx={{ flexShrink: 0 }}>Sign Out</Button>
          </Stack>
        </Stack>
      </SettingsSection>

      <SettingsSection id="settings-notifications" icon={<NotificationsNoneOutlinedIcon />} title="Notifications" description="Choose which updates you want to receive.">
        <Stack spacing={1.5} divider={<Divider flexItem />}>
          {notificationOptions.map((option) => <PreferenceSwitch key={option.key} label={option.label} description={option.description} checked={preferences.notifications[option.key]} onChange={(checked) => updatePreferences({ notifications: { [option.key]: checked } })} />)}
          <Box sx={{ pt: 1 }}><Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Delivery channels</Typography><Stack spacing={1.5}><PreferenceSwitch label="In-app notifications" description="Show updates inside Milestone." checked={preferences.notifications.inApp} onChange={(checked) => updatePreferences({ notifications: { inApp: checked } })} /><PreferenceSwitch label="Email notifications" description="Send updates to your provider email address." checked={preferences.notifications.email} onChange={(checked) => updatePreferences({ notifications: { email: checked } })} /></Stack></Box>
        </Stack>
      </SettingsSection>

      <SettingsSection id="settings-alerts" icon={<WarningAmberOutlinedIcon />} title="Patient alerts" description="Choose which care events should be highlighted for you.">
        <Stack spacing={1.5} divider={<Divider flexItem />}>
          {alertOptions.map((option) => <PreferenceSwitch key={option.key} label={option.label} description={option.description} checked={preferences.alerts[option.key]} onChange={(checked) => updatePreferences({ alerts: { [option.key]: checked } })} />)}
        </Stack>
      </SettingsSection>

      <SettingsSection id="settings-appearance" icon={<PaletteOutlinedIcon />} title="Appearance" description="Choose how the provider dashboard should look.">
        <FormControl component="fieldset" fullWidth>
          <FormLabel component="legend" sx={{ color: 'text.primary', mb: 1 }}>Theme</FormLabel>
          <RadioGroup row value={preferences.theme} onChange={(event) => updatePreferences({ theme: event.target.value as 'light' | 'dark' | 'system' })} aria-label="Provider dashboard theme" sx={{ gap: { xs: .5, sm: 2 }, flexWrap: 'wrap' }}>
            <FormControlLabel value="light" control={<Radio />} label="Light" />
            <FormControlLabel value="dark" control={<Radio />} label="Dark" />
            <FormControlLabel value="system" control={<Radio />} label="Use system preference" />
          </RadioGroup>
        </FormControl>
      </SettingsSection>
    </Stack>

    <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ sm: 'center' }} sx={{ mt: 2.5 }}>
      <Typography variant="body2" color="text.secondary">Reset restores all notification, alert, and appearance defaults.</Typography>
      <Button type="button" onClick={resetPreferences} variant="outlined" startIcon={<RestartAltIcon />} sx={{ flexShrink: 0 }}>Reset Preferences</Button>
    </Stack>
  </Box>
}
