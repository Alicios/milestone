import { useState } from 'react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1'
import MailOutlineIcon from '@mui/icons-material/MailOutline'
import { Alert, Box, Button, Card, Stack, TextField, Typography, useTheme } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { createPatientAndInvite, PatientInviteError } from '../lib/supabaseData'
import { errorMessage } from '../lib/errors'

const fontSx = { fontFamily: 'Georgia, serif', fontStyle: 'italic' }
const teal = '#4b9da9'
const aqua = '#91c8c0'
const orange = '#eb681d'

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function NewPatientPage() {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const border = theme.palette.divider
  const surface = theme.palette.background.paper
  const text = theme.palette.text.primary
  const infoSurface = isDark ? '#21434b' : '#d9f0ed'
  const noteSurface = isDark ? '#29454d' : '#f2eee1'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [inviteFailed, setInviteFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isValidEmail(email)) {
      setEmailError('Enter a valid email address.')
      return
    }
    setEmailError('')
    setSaveError('')
    setSaving(true)
    try {
      await createPatientAndInvite(name, email)
      setInviteFailed(false)
      setSubmitted(true)
    } catch (error) {
      if (error instanceof PatientInviteError) {
        // The patient record was created; only sending the invite failed.
        setInviteFailed(true)
        setSubmitted(true)
      } else {
        setSaveError(errorMessage(error, 'The patient could not be saved.'))
      }
    } finally {
      setSaving(false)
    }
  }

  function reset() {
    setName('')
    setEmail('')
    setEmailError('')
    setSaveError('')
    setSubmitted(false)
    setInviteFailed(false)
  }

  if (submitted) return <Box maxWidth={650} mx="auto" py={{ xs: 2, md: 5 }}>
    <Card sx={{ border: `4px solid ${border}`, borderRadius: '30px', bgcolor: surface, color: text, p: { xs: 3, sm: 5 }, textAlign: 'center' }}>
      <Box sx={{ width: 92, height: 92, mx: 'auto', mb: 2, borderRadius: '50%', bgcolor: inviteFailed ? '#eb681d' : '#8bd153', border: `4px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckCircleOutlineIcon sx={{ color: 'white', fontSize: 62 }} /></Box>
      <Typography variant="h4" sx={{ ...fontSx, fontWeight: 700, mb: 1 }}>{inviteFailed ? 'Patient saved, invite not sent' : 'Pending account created'}</Typography>
      <Typography sx={{ ...fontSx, fontSize: '1.25rem', mb: 3 }}>{name} has been added to your patient list.</Typography>
      {inviteFailed
        ? <Alert icon={<MailOutlineIcon />} severity="warning" sx={{ mb: 3, border: `3px solid ${border}`, borderRadius: '18px', color: text, ...fontSx, textAlign: 'left' }}>The invitation email to {email} could not be sent. Try inviting {name} again from their patient page.</Alert>
        : <Alert icon={<MailOutlineIcon />} severity="info" sx={{ mb: 3, border: `3px solid ${border}`, borderRadius: '18px', bgcolor: infoSurface, color: text, ...fontSx, textAlign: 'left' }}>An invitation to set up their account was sent to {email}.</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center"><Button component={RouterLink} to="/dashboard" startIcon={<ArrowBackIcon />} sx={{ ...fontSx, color: text, border: `3px solid ${border}`, borderRadius: '20px', px: 3 }}>Back to Patients</Button><Button onClick={reset} sx={{ ...fontSx, bgcolor: orange, color: 'white', border: `3px solid ${border}`, borderRadius: '20px', px: 3, '&:hover': { bgcolor: '#d15a17' } }}>Create Another</Button></Stack>
    </Card>
  </Box>

  return <Box maxWidth={720} mx="auto" py={{ xs: 1, md: 4 }}>
    <Button component={RouterLink} to="/dashboard" startIcon={<ArrowBackIcon />} sx={{ ...fontSx, color: text, mb: 2, fontSize: '1.1rem' }}>Back to Patients</Button>
    <Stack direction="row" spacing={2} alignItems="center" mb={3}><Box sx={{ width: 68, height: 68, flexShrink: 0, borderRadius: '50%', bgcolor: teal, border: `4px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PersonAddAlt1Icon sx={{ color: 'white', fontSize: 40 }} /></Box><Box><Typography variant="h3" sx={{ ...fontSx, fontSize: { xs: '2.1rem', sm: '3rem' } }}>New Patient</Typography><Typography sx={{ ...fontSx, fontSize: '1.1rem' }}>Create a patient and invite them to the app</Typography></Box></Stack>
    <Card component="form" onSubmit={submit} sx={{ border: `4px solid ${border}`, borderRadius: '30px', bgcolor: surface, color: text, p: { xs: 2.5, sm: 4 } }}>
      {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
      <Stack spacing={2.5}><TextField label="Patient name" value={name} onChange={(event) => setName(event.target.value)} required placeholder="Enter full name" sx={{ '& .MuiOutlinedInput-root': { ...fontSx, borderRadius: '18px', '& fieldset': { border: `3px solid ${border}` } }, '& .MuiInputLabel-root': fontSx }} /><TextField label="Patient email" value={email} onChange={(event) => { setEmail(event.target.value); setEmailError('') }} error={Boolean(emailError)} helperText={emailError || 'Used to send their invitation to set up the app.'} placeholder="patient@example.com" type="email" required sx={{ '& .MuiOutlinedInput-root': { ...fontSx, borderRadius: '18px', '& fieldset': { border: `3px solid ${border}` } }, '& .MuiInputLabel-root': fontSx, '& .MuiFormHelperText-root': { ...fontSx, ml: 0 } }} />
        <Box sx={{ bgcolor: noteSurface, border: `3px solid ${border}`, borderRadius: '18px', p: 2 }}><Typography sx={{ ...fontSx, fontWeight: 700 }}>What happens next?</Typography><Typography sx={{ ...fontSx }}>The patient is added to your list right away, and an email is sent inviting them to set up their account.</Typography></Box>
        <Stack direction="row" spacing={1.5} justifyContent="flex-end"><Button component={RouterLink} to="/dashboard" sx={{ ...fontSx, color: text, border: `3px solid ${border}`, borderRadius: '20px', px: 3 }}>Cancel</Button><Button type="submit" disabled={!name.trim() || !email.trim() || saving} sx={{ ...fontSx, bgcolor: orange, color: 'white', border: `3px solid ${border}`, borderRadius: '20px', px: 3, '&:hover': { bgcolor: '#d15a17' }, '&.Mui-disabled': { bgcolor: '#d6b39f', color: 'white' } }}>{saving ? 'Saving…' : 'Create & Invite Patient'}</Button></Stack>
      </Stack>
    </Card>
  </Box>
}
