import { useState, type FormEvent } from 'react'
import HowToRegOutlinedIcon from '@mui/icons-material/HowToRegOutlined'
import { Alert, Box, Button, CircularProgress, Container, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { Brand } from '../components/Brand'

const DEPARTMENTS = ['Physical Therapy', 'Occupational Therapy', 'Sports Medicine', 'Administration', 'IT / Systems', 'Other']

export function RequestAccessPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [department, setDepartment] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!name.trim()) return setError('Enter your full name.')
    if (!email.trim() || !email.includes('@')) return setError('Enter a valid email address.')
    if (!department) return setError('Select your department.')
    setLoading(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 600))
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <Box minHeight="100vh" display="flex" alignItems="center" bgcolor="background.default" py={4}>
        <Container maxWidth="sm">
          <Paper sx={{ p: { xs: 3, sm: 5 }, textAlign: 'center' }}>
            <Box display="inline-flex"><Brand /></Box>
            <Typography variant="h4" mt={4} mb={1}>Request received</Typography>
            <Typography color="text.secondary" mb={4}>Thanks, {name}. Our team will review your request and follow up at {email}.</Typography>
            <Button component={RouterLink} to="/" variant="contained" size="large">Back to home</Button>
          </Paper>
        </Container>
      </Box>
    )
  }

  return (
    <Box minHeight="100vh" display="flex" alignItems="center" bgcolor="background.default" py={4}>
      <Container maxWidth="sm">
        <Box textAlign="center" mb={4}>
          <Box display="inline-flex"><Brand /></Box>
          <Typography variant="h4" mt={4} mb={1}>Request access</Typography>
          <Typography color="text.secondary">Tell us a bit about yourself and we'll set up your workspace.</Typography>
        </Box>
        <Paper component="form" onSubmit={handleSubmit} sx={{ p: { xs: 3, sm: 5 } }}>
          <Stack spacing={3}>
            <Box display="flex" justifyContent="center">
              <Box sx={{ p: 1.5, bgcolor: 'primary.light', color: 'white', borderRadius: '50%', display: 'flex' }}>
                <HowToRegOutlinedIcon />
              </Box>
            </Box>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Full name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
            <TextField label="Work email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
            <TextField select label="Department" value={department} onChange={(event) => setDepartment(event.target.value)} required>
              {DEPARTMENTS.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
            </TextField>
            <TextField label="Additional notes (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} multiline minRows={3} />
            <Button type="submit" variant="contained" size="large" disabled={loading}>
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Request access'}
            </Button>
            <Typography textAlign="center" variant="body2" color="text.secondary">
              Already have an account? <Button component={RouterLink} to="/login" size="small">Sign in</Button>
            </Typography>
          </Stack>
        </Paper>
        <Typography textAlign="center" mt={3} variant="caption" color="text.secondary">Milestone prototype • No real patient data is used</Typography>
      </Container>
    </Box>
  )
}
