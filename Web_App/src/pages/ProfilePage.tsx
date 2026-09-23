import { useState, type FormEvent } from 'react'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import { Alert, Avatar, Box, Button, Card, Divider, Stack, TextField, Typography } from '@mui/material'
import { useAuth } from '../auth/AuthContext'
import type { ProfileFields } from '../types'

const fontSx = { fontFamily: 'Georgia, serif' }
const headingSx = { ...fontSx, fontStyle: 'italic' }
const buttonSx = { ...headingSx, color: 'black', border: '3px solid black', borderRadius: '20px', px: 3 }
const primaryButtonSx = { ...buttonSx, bgcolor: '#eb681d', color: 'white', '&:hover': { bgcolor: '#d15a17' } }
const fieldSx = {
  '& .MuiOutlinedInput-root': { ...fontSx, borderRadius: '18px' },
  '& .MuiOutlinedInput-notchedOutline': { borderWidth: '2px' },
  '& .MuiInputLabel-root': fontSx,
}

const fields: { key: keyof ProfileFields; label: string; type?: string; autoComplete?: string; required?: boolean }[] = [
  { key: 'name', label: 'Full name', autoComplete: 'name', required: true },
  { key: 'role', label: 'Professional role/title', autoComplete: 'organization-title' },
  { key: 'email', label: 'Email', type: 'email', autoComplete: 'email', required: true },
  { key: 'phone', label: 'Phone number', type: 'tel', autoComplete: 'tel' },
  { key: 'specialty', label: 'Specialty' },
  { key: 'bio', label: 'Short professional bio' },
  { key: 'avatarUrl', label: 'Profile photo URL' },
]

export function ProfilePage() {
  const { user, updateProfile } = useAuth()
  const [draft, setDraft] = useState<ProfileFields | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileFields, string>>>({})
  const [saved, setSaved] = useState(false)

  if (!user) return null

  function startEditing() {
    if (!user) return
    const { name, role, email, phone, specialty, bio, avatarUrl } = user
    setDraft({ name, role, email, phone, specialty, bio, avatarUrl })
    setErrors({})
    setSaved(false)
  }

  function cancelEditing() {
    setDraft(null)
    setErrors({})
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft) return

    const nextProfile: ProfileFields = {
      name: draft.name.trim(),
      role: draft.role.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      specialty: draft.specialty.trim(),
      bio: draft.bio.trim(),
      avatarUrl: draft.avatarUrl.trim(),
    }
    const nextErrors: typeof errors = {}
    if (!nextProfile.name) nextErrors.name = 'Enter your full name.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextProfile.email)) {
      nextErrors.email = 'Enter a valid email address, such as name@example.com.'
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    updateProfile(nextProfile)
    setDraft(null)
    setSaved(true)
  }

  return (
    <Box maxWidth={850} mx="auto" py={{ xs: 1, md: 3 }}>
      <Typography component="h1" variant="h3" sx={{ ...headingSx, fontSize: { xs: '2.1rem', sm: '3rem' }, mb: 1 }}>
        My Profile
      </Typography>
      <Typography sx={{ ...fontSx, mb: 3 }}>Help patients get to know you and your care.</Typography>
      {saved && <Alert severity="success" role="status" sx={{ mb: 2 }}>Your profile has been updated.</Alert>}
      <Card sx={{ border: '4px solid black', borderRadius: '30px', bgcolor: 'white', color: 'black', overflow: 'hidden' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems="center" sx={{ p: { xs: 3, sm: 4 }, bgcolor: '#91c8c0', borderBottom: '3px solid black' }}>
          <Avatar
            src={user.avatarUrl || undefined}
            alt={`${user.name} profile picture`}
            sx={{ width: 112, height: 112, bgcolor: '#4b9da9', color: 'black', border: '3px solid black', fontSize: '2.5rem', ...fontSx }}
          >
            {user.initials}
          </Avatar>
          <Box sx={{ minWidth: 0, textAlign: { xs: 'center', sm: 'left' }, overflowWrap: 'anywhere' }}>
            <Typography component="h2" variant="h4" sx={{ ...headingSx, fontWeight: 700 }}>{user.name}</Typography>
            <Typography sx={{ ...fontSx, fontSize: '1.2rem', mt: 1 }}>{user.role || 'No professional title added'}</Typography>
          </Box>
        </Stack>
        <Box sx={{ p: { xs: 2.5, sm: 4 } }}>
          {draft ? (
            <Box component="form" noValidate onSubmit={saveProfile}>
              <Typography component="h2" variant="h5" sx={{ ...headingSx, mb: 3 }}>Edit Profile</Typography>
              <Stack spacing={2.5}>
                {fields.map((field) => (
                  <TextField
                    key={field.key}
                    id={`profile-${field.key}`}
                    label={field.label}
                    type={field.type ?? 'text'}
                    autoComplete={field.autoComplete}
                    required={field.required}
                    autoFocus={field.key === 'name'}
                    value={draft[field.key]}
                    onChange={(event) => {
                      const value = event.target.value
                      setDraft((current) => current ? { ...current, [field.key]: value } : null)
                      setErrors((current) => ({ ...current, [field.key]: undefined }))
                    }}
                    error={Boolean(errors[field.key])}
                    helperText={errors[field.key] || (field.key === 'avatarUrl' ? 'Use an image URL, or leave blank to show your initials.' : undefined)}
                    multiline={field.key === 'bio'}
                    minRows={field.key === 'bio' ? 3 : undefined}
                    sx={fieldSx}
                  />
                ))}
                <Divider />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="flex-end">
                  <Button type="button" onClick={cancelEditing} sx={buttonSx}>Cancel</Button>
                  <Button type="submit" sx={primaryButtonSx}>Save Changes</Button>
                </Stack>
              </Stack>
            </Box>
          ) : (
            <>
              <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
                {fields.filter((field) => field.key !== 'avatarUrl').map((field) => (
                  <Box key={field.key} sx={{ minWidth: 0, gridColumn: field.key === 'bio' ? '1 / -1' : undefined }}>
                    <Typography component="dt" sx={{ ...fontSx, fontWeight: 700, mb: .75 }}>{field.label}</Typography>
                    <Typography component="dd" sx={{ ...fontSx, m: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                      {user[field.key] || 'Not provided'}
                    </Typography>
                  </Box>
                ))}
              </Box>
              <Divider sx={{ my: 3 }} />
              <Stack direction="row" justifyContent="flex-end">
                <Button onClick={startEditing} startIcon={<EditOutlinedIcon />} sx={primaryButtonSx}>Edit Profile</Button>
              </Stack>
            </>
          )}
        </Box>
      </Card>
    </Box>
  )
}
