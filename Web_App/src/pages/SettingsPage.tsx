import { useState, type FormEvent, type ReactNode } from 'react'
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined'
import ContactPhoneOutlinedIcon from '@mui/icons-material/ContactPhoneOutlined'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import {
  Alert, Box, Button, Card, FormControl, FormControlLabel, FormLabel, MenuItem, Radio, RadioGroup, Stack, TextField, Typography,
} from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import type { PreferredContact, SettingsFields, User } from '../types'

const teal = '#4b9da9'
const aqua = '#91c8c0'
const orange = '#eb681d'
const fontSx = { fontFamily: 'Georgia, serif' }
const headingSx = { ...fontSx, fontStyle: 'italic' }
const buttonSx = { ...headingSx, color: 'black', border: '3px solid black', borderRadius: '20px', px: 3 }
const primaryButtonSx = {
  ...buttonSx,
  bgcolor: orange,
  color: 'white',
  '&:hover': { bgcolor: '#d15a17' },
  '&.Mui-disabled': { bgcolor: '#d6b39f', color: 'white' },
}
const fieldSx = {
  '& .MuiOutlinedInput-root': { ...fontSx, borderRadius: '18px' },
  '& .MuiOutlinedInput-notchedOutline': { borderWidth: '2px' },
  '& .MuiInputLabel-root': fontSx,
  '& .MuiFormHelperText-root': { ...fontSx, ml: 0.5 },
}

const departments = [
  'Physical Therapy',
  'Occupational Therapy',
  'Sports Medicine',
  'Orthopedics',
  'Neurological Rehabilitation',
  'Pediatric Therapy',
  'Cardiopulmonary Rehabilitation',
  'Other',
]

const contactOptions: { value: PreferredContact; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'in-app', label: 'In-app message' },
]

type SettingsErrors = Partial<Record<keyof SettingsFields, string>>

function toSettings(user: User): SettingsFields {
  const { name, role, department, facility, officeLocation, email, phone, workPhone, workPhoneExtension, preferredContact } = user
  return { name, role, department, facility, officeLocation, email, phone, workPhone, workPhoneExtension, preferredContact }
}

function isValidPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))
}

function validate(settings: SettingsFields): SettingsErrors {
  const errors: SettingsErrors = {}
  if (!settings.name) errors.name = 'Enter your full name.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.email)) errors.email = 'Enter a valid email address, such as name@example.com.'
  if (settings.phone && !isValidPhone(settings.phone)) errors.phone = 'Enter a valid 10-digit phone number.'
  if (settings.workPhone && !isValidPhone(settings.workPhone)) errors.workPhone = 'Enter a valid 10-digit phone number.'
  if (settings.workPhoneExtension && !/^\d{1,6}$/.test(settings.workPhoneExtension)) errors.workPhoneExtension = 'Use up to 6 digits.'
  if (settings.preferredContact === 'phone' && !settings.phone && !settings.workPhone) {
    errors.preferredContact = 'Add a mobile or work phone number to be contacted by phone.'
  }
  return errors
}

function SettingsSection({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <Card component="section" sx={{ border: '4px solid black', borderRadius: '30px', bgcolor: 'white', color: 'black', overflow: 'hidden' }}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ px: { xs: 2.5, sm: 4 }, py: 2, bgcolor: aqua, borderBottom: '3px solid black' }}>
        <Box sx={{ width: 48, height: 48, flexShrink: 0, borderRadius: '50%', bgcolor: teal, border: '3px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
          {icon}
        </Box>
        <Box>
          <Typography component="h2" variant="h5" sx={{ ...headingSx, fontWeight: 700 }}>{title}</Typography>
          <Typography sx={fontSx}>{description}</Typography>
        </Box>
      </Stack>
      <Box sx={{ p: { xs: 2.5, sm: 4 }, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
        {children}
      </Box>
    </Card>
  )
}

export function SettingsPage() {
  const { user, updateProfile } = useAuth()
  const [draft, setDraft] = useState<SettingsFields | null>(() => user ? toSettings(user) : null)
  const [errors, setErrors] = useState<SettingsErrors>({})
  const [saved, setSaved] = useState(false)

  if (!user || !draft) return null

  const original = toSettings(user)
  const isDirty = (Object.keys(original) as (keyof SettingsFields)[]).some((key) => original[key] !== draft[key])

  function setField<K extends keyof SettingsFields>(key: K, value: SettingsFields[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current)
    setErrors((current) => ({ ...current, [key]: undefined }))
    setSaved(false)
  }

  function textField(key: Exclude<keyof SettingsFields, 'preferredContact'>, label: string, options: { type?: string; autoComplete?: string; required?: boolean; helperText?: string; fullRow?: boolean } = {}) {
    return (
      <TextField
        id={`settings-${key}`}
        label={label}
        type={options.type ?? 'text'}
        autoComplete={options.autoComplete}
        required={options.required}
        value={draft![key]}
        onChange={(event) => setField(key, event.target.value)}
        error={Boolean(errors[key])}
        helperText={errors[key] || options.helperText}
        sx={{ ...fieldSx, gridColumn: options.fullRow ? '1 / -1' : undefined }}
      />
    )
  }

  function resetChanges() {
    setDraft(toSettings(user!))
    setErrors({})
    setSaved(false)
  }

  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft) return

    const next: SettingsFields = {
      name: draft.name.trim(),
      role: draft.role.trim(),
      department: draft.department.trim(),
      facility: draft.facility.trim(),
      officeLocation: draft.officeLocation.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      workPhone: draft.workPhone.trim(),
      workPhoneExtension: draft.workPhoneExtension.trim(),
      preferredContact: draft.preferredContact,
    }
    const nextErrors = validate(next)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    updateProfile(next)
    setDraft(next)
    setSaved(true)
  }

  return (
    <Box maxWidth={900} mx="auto" py={{ xs: 1, md: 3 }}>
      <Button component={RouterLink} to="/dashboard" startIcon={<ArrowBackIcon />} sx={{ ...headingSx, color: 'black', mb: 2, fontSize: '1.1rem' }}>Back to Dashboard</Button>
      <Stack direction="row" spacing={2} alignItems="center" mb={3}>
        <Box sx={{ width: 68, height: 68, flexShrink: 0, borderRadius: '50%', bgcolor: teal, border: '4px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <SettingsOutlinedIcon sx={{ color: 'white', fontSize: 40 }} />
        </Box>
        <Box>
          <Typography component="h1" variant="h3" sx={{ ...headingSx, fontSize: { xs: '2.1rem', sm: '3rem' } }}>Settings</Typography>
          <Typography sx={{ ...fontSx, fontSize: '1.1rem' }}>Manage your account, department, and contact details.</Typography>
        </Box>
      </Stack>

      {saved && <Alert severity="success" role="status" sx={{ mb: 2, border: '3px solid black', borderRadius: '18px', ...fontSx }}>Your settings have been saved.</Alert>}

      <Box component="form" noValidate onSubmit={saveSettings}>
        <Stack spacing={3}>
          <SettingsSection icon={<BadgeOutlinedIcon />} title="General" description="Your name and professional title as patients and colleagues see them.">
            {textField('name', 'Full name', { autoComplete: 'name', required: true })}
            {textField('role', 'Professional role/title', { autoComplete: 'organization-title' })}
          </SettingsSection>

          <SettingsSection icon={<ApartmentOutlinedIcon />} title="Department" description="Where you work and which team you belong to.">
            <TextField
              select
              id="settings-department"
              label="Department"
              value={departments.includes(draft.department) || !draft.department ? draft.department : 'Other'}
              onChange={(event) => setField('department', event.target.value)}
              sx={fieldSx}
            >
              {departments.map((department) => <MenuItem key={department} value={department} sx={fontSx}>{department}</MenuItem>)}
            </TextField>
            {textField('facility', 'Clinic/facility', { autoComplete: 'organization' })}
            {textField('officeLocation', 'Office location', { helperText: 'Building, floor, or room number.' })}
            <TextField id="settings-provider-id" label="Provider ID" value={user.id} disabled helperText="Contact an administrator to change this." sx={fieldSx} />
          </SettingsSection>

          <SettingsSection icon={<ContactPhoneOutlinedIcon />} title="Contact Information" description="How patients and your care team can reach you.">
            {textField('email', 'Email', { type: 'email', autoComplete: 'email', required: true, fullRow: true })}
            {textField('phone', 'Mobile phone', { type: 'tel', autoComplete: 'tel' })}
            <Stack direction="row" spacing={1.5}>
              <Box sx={{ flex: 2 }}>{textField('workPhone', 'Work phone', { type: 'tel', autoComplete: 'work tel' })}</Box>
              <Box sx={{ flex: 1 }}>{textField('workPhoneExtension', 'Ext.')}</Box>
            </Stack>
            <FormControl error={Boolean(errors.preferredContact)} sx={{ gridColumn: '1 / -1' }}>
              <FormLabel id="settings-preferred-contact-label" sx={{ ...fontSx, fontWeight: 700, color: 'black', '&.Mui-focused': { color: 'black' } }}>Preferred contact method</FormLabel>
              <RadioGroup
                row
                aria-labelledby="settings-preferred-contact-label"
                value={draft.preferredContact}
                onChange={(event) => setField('preferredContact', event.target.value as PreferredContact)}
              >
                {contactOptions.map((option) => (
                  <FormControlLabel key={option.value} value={option.value} control={<Radio sx={{ '&.Mui-checked': { color: orange } }} />} label={option.label} slotProps={{ typography: fontSx }} />
                ))}
              </RadioGroup>
              {errors.preferredContact && <Typography role="alert" variant="body2" color="error" sx={fontSx}>{errors.preferredContact}</Typography>}
            </FormControl>
          </SettingsSection>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="flex-end">
            <Button type="button" onClick={resetChanges} disabled={!isDirty} sx={buttonSx}>Discard Changes</Button>
            <Button type="submit" disabled={!isDirty} sx={primaryButtonSx}>Save Settings</Button>
          </Stack>
        </Stack>
      </Box>
    </Box>
  )
}
