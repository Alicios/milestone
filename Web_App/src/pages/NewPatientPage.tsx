import { useState } from 'react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1'
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined'
import { Alert, Box, Button, Card, Stack, TextField, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'

const fontSx = { fontFamily: 'Georgia, serif', fontStyle: 'italic' }
const teal = '#4b9da9'
const aqua = '#91c8c0'
const orange = '#eb681d'

function isValidPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))
}

export function NewPatientPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isValidPhone(phone)) {
      setPhoneError('Enter a valid 10-digit phone number.')
      return
    }
    setPhoneError('')
    setSubmitted(true)
  }

  function reset() {
    setName('')
    setPhone('')
    setPhoneError('')
    setSubmitted(false)
  }

  if (submitted) return <Box maxWidth={650} mx="auto" py={{ xs: 2, md: 5 }}>
    <Card sx={{ border: '4px solid black', borderRadius: '30px', bgcolor: 'white', p: { xs: 3, sm: 5 }, textAlign: 'center' }}>
      <Box sx={{ width: 92, height: 92, mx: 'auto', mb: 2, borderRadius: '50%', bgcolor: '#8bd153', border: '4px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckCircleOutlineIcon sx={{ color: 'white', fontSize: 62 }} /></Box>
      <Typography variant="h4" sx={{ ...fontSx, fontWeight: 700, mb: 1 }}>Pending account created</Typography>
      <Typography sx={{ ...fontSx, fontSize: '1.25rem', mb: 3 }}> {name} has been added to your pending patient list.</Typography>
      <Alert icon={<SmsOutlinedIcon />} severity="info" sx={{ mb: 3, border: '3px solid black', borderRadius: '18px', bgcolor: '#d9f0ed', color: 'black', ...fontSx, textAlign: 'left' }}>A sign-up link and notification have been sent to {phone}.</Alert>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center"><Button component={RouterLink} to="/dashboard" startIcon={<ArrowBackIcon />} sx={{ ...fontSx, color: 'black', border: '3px solid black', borderRadius: '20px', px: 3 }}>Back to Patients</Button><Button onClick={reset} sx={{ ...fontSx, bgcolor: orange, color: 'white', border: '3px solid black', borderRadius: '20px', px: 3, '&:hover': { bgcolor: '#d15a17' } }}>Create Another</Button></Stack>
    </Card>
  </Box>

  return <Box maxWidth={720} mx="auto" py={{ xs: 1, md: 4 }}>
    <Button component={RouterLink} to="/dashboard" startIcon={<ArrowBackIcon />} sx={{ ...fontSx, color: 'black', mb: 2, fontSize: '1.1rem' }}>Back to Patients</Button>
    <Stack direction="row" spacing={2} alignItems="center" mb={3}><Box sx={{ width: 68, height: 68, flexShrink: 0, borderRadius: '50%', bgcolor: teal, border: '4px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PersonAddAlt1Icon sx={{ color: 'white', fontSize: 40 }} /></Box><Box><Typography variant="h3" sx={{ ...fontSx, fontSize: { xs: '2.1rem', sm: '3rem' } }}>New Patient</Typography><Typography sx={{ ...fontSx, fontSize: '1.1rem' }}>Create a pending patient account</Typography></Box></Stack>
    <Card component="form" onSubmit={submit} sx={{ border: '4px solid black', borderRadius: '30px', bgcolor: 'white', p: { xs: 2.5, sm: 4 } }}>
      <Stack spacing={2.5}><TextField label="Patient name" value={name} onChange={(event) => setName(event.target.value)} required placeholder="Enter full name" sx={{ '& .MuiOutlinedInput-root': { ...fontSx, borderRadius: '18px', '& fieldset': { border: '3px solid black' } }, '& .MuiInputLabel-root': fontSx }} /><TextField label="Phone number" value={phone} onChange={(event) => { setPhone(event.target.value); setPhoneError('') }} required error={Boolean(phoneError)} helperText={phoneError || 'The patient will receive a secure sign-up link by text message.'} placeholder="(555) 123-4567" type="tel" inputMode="tel" sx={{ '& .MuiOutlinedInput-root': { ...fontSx, borderRadius: '18px', '& fieldset': { border: '3px solid black' } }, '& .MuiInputLabel-root': fontSx, '& .MuiFormHelperText-root': { ...fontSx, ml: 0 } }} />
        <Box sx={{ bgcolor: '#f2eee1', border: '3px solid black', borderRadius: '18px', p: 2 }}><Typography sx={{ ...fontSx, fontWeight: 700 }}>What happens next?</Typography><Typography sx={{ ...fontSx }}>The account will appear as pending until the patient completes sign-up. They will receive a notification and link at the phone number above.</Typography></Box>
        <Stack direction="row" spacing={1.5} justifyContent="flex-end"><Button component={RouterLink} to="/dashboard" sx={{ ...fontSx, color: 'black', border: '3px solid black', borderRadius: '20px', px: 3 }}>Cancel</Button><Button type="submit" disabled={!name.trim() || !phone.trim()} sx={{ ...fontSx, bgcolor: orange, color: 'white', border: '3px solid black', borderRadius: '20px', px: 3, '&:hover': { bgcolor: '#d15a17' }, '&.Mui-disabled': { bgcolor: '#d6b39f', color: 'white' } }}>Create Pending Account</Button></Stack>
      </Stack>
    </Card>
  </Box>
}
