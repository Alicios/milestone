import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined'
import { Alert, Avatar, Box, Button, ButtonBase, Card, Divider, FormControl, FormControlLabel, FormLabel, MenuItem, Radio, RadioGroup, Stack, TextField, Typography } from '@mui/material'
import { useAuth } from '../auth/AuthContext'
import type { PreferredContact, ProfileFields } from '../types'

const fontSx = { fontFamily: 'Georgia, serif' }
const headingSx = { ...fontSx, fontStyle: 'italic' }
const buttonSx = { ...headingSx, color: 'black', border: '3px solid black', borderRadius: '20px', px: 3 }
const primaryButtonSx = { ...buttonSx, bgcolor: '#eb681d', color: 'white', '&:hover': { bgcolor: '#d15a17' } }
const fieldSx = {
  '& .MuiOutlinedInput-root': { ...fontSx, borderRadius: '18px' },
  '& .MuiOutlinedInput-notchedOutline': { borderWidth: '2px' },
  '& .MuiInputLabel-root': fontSx,
}

const departments = [
  'Physical Therapy', 'Occupational Therapy', 'Sports Medicine', 'Orthopedics',
  'Neurological Rehabilitation', 'Pediatric Therapy', 'Cardiopulmonary Rehabilitation', 'Other',
]

const contactOptions: { value: PreferredContact; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'in-app', label: 'In-app message' },
]

type ProfileField = {
  key: Exclude<keyof ProfileFields, 'avatarUrl' | 'preferredContact'>
  label: string
  type?: string
  autoComplete?: string
  required?: boolean
  fullRow?: boolean
  helperText?: string
}

const sections: { id: string; title: string; fields: ProfileField[] }[] = [
  { id: 'personal', title: 'Personal & Professional', fields: [
    { key: 'name', label: 'Full name', autoComplete: 'name', required: true },
    { key: 'role', label: 'Professional role/title', autoComplete: 'organization-title' },
    { key: 'specialty', label: 'Specialty' },
    { key: 'bio', label: 'Short professional bio', fullRow: true },
  ] },
  { id: 'workplace', title: 'Workplace', fields: [
    { key: 'department', label: 'Department' },
    { key: 'facility', label: 'Clinic/facility', autoComplete: 'organization' },
    { key: 'officeLocation', label: 'Office location', helperText: 'Building, floor, or room number.' },
  ] },
  { id: 'contact', title: 'Contact Information', fields: [
    { key: 'email', label: 'Contact email', type: 'email', autoComplete: 'email', required: true },
    { key: 'phone', label: 'Mobile phone', type: 'tel', autoComplete: 'tel' },
    { key: 'workPhone', label: 'Work phone', type: 'tel', autoComplete: 'work tel' },
    { key: 'workPhoneExtension', label: 'Extension' },
  ] },
]

function isValidPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))
}

export function ProfilePage() {
  const { user, updateProfile } = useAuth()
  const [draft, setDraft] = useState<ProfileFields | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileFields, string>>>({})
  const [saved, setSaved] = useState(false)
  const [photoLoading, setPhotoLoading] = useState(false)
  const photoInput = useRef<HTMLInputElement>(null)
  const photoReader = useRef<FileReader | null>(null)

  function stopReadingPhoto() {
    const reader = photoReader.current
    photoReader.current = null
    if (reader?.readyState === FileReader.LOADING) reader.abort()
  }

  useEffect(() => () => stopReadingPhoto(), [])

  if (!user) return null

  function startEditing() {
    if (!user) return
    const { name, role, email, phone, specialty, bio, avatarUrl, department, facility, officeLocation, workPhone, workPhoneExtension, preferredContact } = user
    setDraft({ name, role, email, phone, specialty, bio, avatarUrl, department, facility, officeLocation, workPhone, workPhoneExtension, preferredContact })
    setErrors({})
    setSaved(false)
  }

  function cancelEditing() {
    stopReadingPhoto()
    setPhotoLoading(false)
    setDraft(null)
    setErrors({})
  }

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    stopReadingPhoto()
    setPhotoLoading(false)
    setErrors((current) => ({ ...current, avatarUrl: undefined }))
    if (!file.type.startsWith('image/')) {
      setErrors((current) => ({ ...current, avatarUrl: 'Choose an image file.' }))
      return
    }

    const reader = new FileReader()
    photoReader.current = reader
    setPhotoLoading(true)

    function photoFailed() {
      if (photoReader.current !== reader) return
      photoReader.current = null
      setPhotoLoading(false)
      setErrors((current) => ({ ...current, avatarUrl: 'This image could not be opened. Please choose another image.' }))
    }

    reader.onerror = photoFailed
    reader.onload = async () => {
      const dataUrl = reader.result
      if (typeof dataUrl !== 'string') return photoFailed()
      const image = new Image()
      image.src = dataUrl
      try {
        await image.decode()
        if (photoReader.current !== reader) return
        setDraft((current) => current ? { ...current, avatarUrl: dataUrl } : null)
        photoReader.current = null
        setPhotoLoading(false)
      } catch {
        photoFailed()
      }
    }
    reader.readAsDataURL(file)
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || photoLoading) return

    const nextProfile: ProfileFields = {
      name: draft.name.trim(),
      role: draft.role.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      specialty: draft.specialty.trim(),
      bio: draft.bio.trim(),
      avatarUrl: draft.avatarUrl.trim(),
      department: draft.department.trim(),
      facility: draft.facility.trim(),
      officeLocation: draft.officeLocation.trim(),
      workPhone: draft.workPhone.trim(),
      workPhoneExtension: draft.workPhoneExtension.trim(),
      preferredContact: draft.preferredContact,
    }
    const nextErrors: typeof errors = {}
    if (!nextProfile.name) nextErrors.name = 'Enter your full name.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextProfile.email)) {
      nextErrors.email = 'Enter a valid email address, such as name@example.com.'
    }
    if (nextProfile.phone && !isValidPhone(nextProfile.phone)) nextErrors.phone = 'Enter a valid 10-digit phone number.'
    if (nextProfile.workPhone && !isValidPhone(nextProfile.workPhone)) nextErrors.workPhone = 'Enter a valid 10-digit phone number.'
    if (nextProfile.workPhoneExtension && !/^\d{1,6}$/.test(nextProfile.workPhoneExtension)) nextErrors.workPhoneExtension = 'Use up to 6 digits.'
    if (nextProfile.preferredContact === 'phone' && !nextProfile.phone && !nextProfile.workPhone) {
      nextErrors.preferredContact = 'Add a mobile or work phone number to be contacted by phone.'
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    updateProfile(nextProfile)
    setDraft(null)
    setSaved(true)
  }

  const avatar = (
    <Avatar
      src={(draft?.avatarUrl ?? user.avatarUrl) || undefined}
      alt={`${user.name} profile picture`}
      sx={{ width: 112, height: 112, bgcolor: '#4b9da9', color: 'black', border: '3px solid black', fontSize: '2.5rem', ...fontSx }}
    >
      {user.initials}
    </Avatar>
  )

  const profileSections = (
    <Stack spacing={3} divider={<Divider />}>
      {sections.map((section) => (
        <Box component="section" key={section.id} aria-labelledby={`profile-section-${section.id}`}>
          <Typography id={`profile-section-${section.id}`} component={draft ? 'h3' : 'h2'} variant="h5" sx={{ ...headingSx, mb: 2, px: 2, py: 1, bgcolor: '#91c8c0', borderRadius: '18px' }}>
            {section.title}
          </Typography>
          <Box component={draft ? 'div' : 'dl'} sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2.5 }}>
            {section.fields.map((field) => draft ? (
              <TextField
                key={field.key}
                id={`profile-${field.key}`}
                label={field.label}
                type={field.type ?? 'text'}
                autoComplete={field.autoComplete}
                required={field.required}
                autoFocus={field.key === 'name'}
                select={field.key === 'department'}
                value={field.key === 'department' && draft.department && !departments.includes(draft.department) ? 'Other' : draft[field.key]}
                onChange={(event) => {
                  const value = event.target.value
                  setDraft((current) => current ? { ...current, [field.key]: value } : null)
                  setErrors((current) => ({ ...current, [field.key]: undefined }))
                }}
                error={Boolean(errors[field.key])}
                helperText={errors[field.key] || field.helperText}
                multiline={field.key === 'bio'}
                minRows={field.key === 'bio' ? 3 : undefined}
                sx={{ ...fieldSx, gridColumn: field.fullRow ? '1 / -1' : undefined }}
              >
                {field.key === 'department' && departments.map((department) => <MenuItem key={department} value={department} sx={fontSx}>{department}</MenuItem>)}
              </TextField>
            ) : (
              <Box key={field.key} sx={{ minWidth: 0, gridColumn: field.fullRow ? '1 / -1' : undefined }}>
                <Typography component="dt" sx={{ ...fontSx, fontWeight: 700, mb: .75 }}>{field.label}</Typography>
                <Typography component="dd" sx={{ ...fontSx, m: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{user[field.key] || 'Not provided'}</Typography>
              </Box>
            ))}
            {section.id === 'contact' && (draft ? (
              <FormControl error={Boolean(errors.preferredContact)} sx={{ gridColumn: '1 / -1' }}>
                <FormLabel id="profile-preferred-contact-label" sx={{ ...fontSx, fontWeight: 700, color: 'black', '&.Mui-focused': { color: 'black' } }}>Preferred contact method</FormLabel>
                <RadioGroup row aria-labelledby="profile-preferred-contact-label" value={draft.preferredContact} onChange={(event) => {
                  const value = event.target.value as PreferredContact
                  setDraft((current) => current ? { ...current, preferredContact: value } : null)
                  setErrors((current) => ({ ...current, preferredContact: undefined }))
                }}>
                  {contactOptions.map((option) => <FormControlLabel key={option.value} value={option.value} control={<Radio sx={{ '&.Mui-checked': { color: '#eb681d' } }} />} label={option.label} slotProps={{ typography: fontSx }} />)}
                </RadioGroup>
                {errors.preferredContact && <Typography role="alert" variant="body2" color="error" sx={fontSx}>{errors.preferredContact}</Typography>}
              </FormControl>
            ) : (
              <Box sx={{ gridColumn: '1 / -1' }}>
                <Typography component="dt" sx={{ ...fontSx, fontWeight: 700, mb: .75 }}>Preferred contact method</Typography>
                <Typography component="dd" sx={{ ...fontSx, m: 0 }}>{contactOptions.find((option) => option.value === user.preferredContact)?.label}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Stack>
  )

  return (
    <Box maxWidth={850} mx="auto" py={{ xs: 1, md: 3 }}>
      <Typography component="h1" variant="h3" sx={{ ...headingSx, fontSize: { xs: '2.1rem', sm: '3rem' }, mb: 1 }}>
        My Profile
      </Typography>
      <Typography sx={{ ...fontSx, mb: 3 }}>Help patients get to know you and your care.</Typography>
      {saved && <Alert severity="success" role="status" sx={{ mb: 2 }}>Your profile has been updated.</Alert>}
      <Card sx={{ border: '4px solid black', borderRadius: '30px', bgcolor: 'white', color: 'black', overflow: 'hidden' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems="center" sx={{ p: { xs: 3, sm: 4 }, bgcolor: '#91c8c0', borderBottom: '3px solid black' }}>
          <Stack alignItems="center" sx={{ width: 112, flexShrink: 0 }}>
            {draft ? (
              <>
                <ButtonBase
                  type="button"
                  aria-label="Change profile photo"
                  title="Change profile photo"
                  onClick={() => photoInput.current?.click()}
                  sx={{ borderRadius: '50%', '&:hover': { opacity: .85 }, '&.Mui-focusVisible': { outline: '3px solid black', outlineOffset: 4 } }}
                >
                  {avatar}
                  <Box sx={{ position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: '50%', bgcolor: '#eb681d', color: 'white', border: '2px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <PhotoCameraOutlinedIcon sx={{ fontSize: 18 }} />
                  </Box>
                </ButtonBase>
                <input ref={photoInput} type="file" accept="image/*" aria-label="Profile photo" hidden onChange={selectPhoto} />
                {draft.avatarUrl && (
                  <Button type="button" size="small" sx={{ ...fontSx, mt: 1, px: 0, color: 'black', textTransform: 'none', textDecoration: 'underline' }} onClick={() => {
                    stopReadingPhoto()
                    setPhotoLoading(false)
                    setDraft((current) => current ? { ...current, avatarUrl: '' } : null)
                    setErrors((current) => ({ ...current, avatarUrl: undefined }))
                  }}>Remove Photo</Button>
                )}
              </>
            ) : avatar}
          </Stack>
          <Box sx={{ minWidth: 0, textAlign: { xs: 'center', sm: 'left' }, overflowWrap: 'anywhere' }}>
            <Typography component="h2" variant="h4" sx={{ ...headingSx, fontWeight: 700 }}>{user.name}</Typography>
            <Typography sx={{ ...fontSx, fontSize: '1.2rem', mt: 1 }}>{user.role || 'No professional title added'}</Typography>
            {draft && photoLoading && <Typography variant="body2" role="status" sx={{ ...fontSx, mt: 1 }}>Opening image…</Typography>}
            {draft && errors.avatarUrl && <Typography role="alert" variant="body2" color="error" sx={{ ...fontSx, mt: 1 }}>{errors.avatarUrl}</Typography>}
          </Box>
        </Stack>
        <Box sx={{ p: { xs: 2.5, sm: 4 } }}>
          {draft ? (
            <Box component="form" noValidate onSubmit={saveProfile}>
              <Typography component="h2" variant="h5" sx={{ ...headingSx, mb: 3 }}>Edit Profile</Typography>
              <Stack spacing={2.5}>
                {profileSections}
                <Divider />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="flex-end">
                  <Button type="button" onClick={cancelEditing} sx={buttonSx}>Cancel</Button>
                  <Button type="submit" disabled={photoLoading} sx={primaryButtonSx}>Save Changes</Button>
                </Stack>
              </Stack>
            </Box>
          ) : (
            <>
              {profileSections}
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
