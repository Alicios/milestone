import { useState, type FormEvent } from 'react'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import { Alert, Box, Button, CircularProgress, Container, IconButton, InputAdornment, Paper, Stack, TextField, Typography } from '@mui/material'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { useAuth } from '../auth/AuthContext'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('maya.patel@milestone.example')
  const [password, setPassword] = useState('provider123')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    if (!email.trim() || !email.includes('@')) return setError('Enter a valid email address.')
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    setLoading(true)
    try { await login(email, password); navigate('/dashboard', { replace: true }) } catch (submissionError) { setError(submissionError instanceof Error ? submissionError.message : 'Unable to sign in.') } finally { setLoading(false) }
  }

  return <Box minHeight="100vh" display="flex" alignItems="center" bgcolor="background.default" py={4}><Container maxWidth="sm"><Box textAlign="center" mb={4}><Box display="inline-flex"><Brand /></Box><Typography variant="h4" mt={4} mb={1}>Welcome back</Typography><Typography color="text.secondary">Sign in to your physical therapy workspace.</Typography></Box><Paper component="form" onSubmit={handleSubmit} sx={{ p: { xs: 3, sm: 5 } }}><Stack spacing={3}><Box display="flex" justifyContent="center"><Box sx={{ p: 1.5, bgcolor: 'primary.light', color: 'white', borderRadius: '50%', display: 'flex' }}><LockOutlinedIcon /></Box></Box>{error && <Alert severity="error">{error}</Alert>}<TextField label="Work email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /><TextField label="Password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required InputProps={{ endAdornment: <InputAdornment position="end"><IconButton aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)} edge="end">{showPassword ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}</IconButton></InputAdornment> }} /><Box display="flex" justifyContent="flex-end"><Button size="small">Forgot password?</Button></Box><Button type="submit" variant="contained" size="large" disabled={loading}>{loading ? <CircularProgress size={24} color="inherit" /> : 'Sign in'}</Button><Typography textAlign="center" variant="body2" color="text.secondary">Need an account? <Button component={RouterLink} to="/" size="small">Contact your administrator</Button></Typography></Stack></Paper><Typography textAlign="center" mt={3} variant="caption" color="text.secondary">Milestone prototype • No real patient data is used</Typography></Container></Box>
}
