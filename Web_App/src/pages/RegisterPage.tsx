import { useState, type FormEvent } from 'react'
import HowToRegOutlinedIcon from '@mui/icons-material/HowToRegOutlined'
import { Alert, Box, Button, CircularProgress, Container, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { useAuth } from '../auth/AuthContext'

const SPECIALTIES = ['Physical Therapy', 'Occupational Therapy', 'Sports Medicine', 'Administration', 'Other']

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!name.trim()) return setError('Enter your full name.')
    if (!email.trim() || !email.includes('@')) return setError('Enter a valid work email address.')
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    if (password !== confirmPassword) return setError('Passwords must match.')
    if (!specialty) return setError('Select your specialty or department.')

    setLoading(true)
    try {
      await register({ name, email, password, confirmPassword, specialty })
      navigate('/dashboard', { replace: true })
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to create your account.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box minHeight="100vh" display="flex" alignItems="center" bgcolor="background.default" py={4}>
      <Container maxWidth="sm">
        <Box textAlign="center" mb={4}>
          <Box display="inline-flex"><Brand /></Box>
          <Typography variant="h4" mt={4} mb={1}>Create your provider account</Typography>
          <Typography color="text.secondary">Set up your Milestone workspace and start coordinating better care.</Typography>
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
            <TextField select label="Specialty or department" value={specialty} onChange={(event) => setSpecialty(event.target.value)} required>
              {SPECIALTIES.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
            </TextField>
            <TextField label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" helperText="Use at least 6 characters." required />
            <TextField label="Confirm password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required />
            <Button type="submit" variant="contained" size="large" disabled={loading}>
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Create account'}
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
