import { errorMessage } from '../lib/errors'
import { useEffect, useState, type FormEvent } from 'react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import { Alert, Box, Button, CircularProgress, Container, Grid, IconButton, InputAdornment, Paper, Stack, TextField, Typography } from '@mui/material'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { useAuth } from '../auth/AuthContext'
import { useRedirectIfAuthenticated } from '../auth/useRedirectIfAuthenticated'
import { publicAsset } from '../lib/assets'

const loginImages = [
  { src: publicAsset('login-therapists.png'), alt: 'A male and female physical therapist standing back-to-back in a rehabilitation clinic.' },
  { src: publicAsset('login-therapist-male.png'), alt: 'A male physical therapist standing confidently in a rehabilitation clinic.' },
  { src: publicAsset('login-therapist-female.png'), alt: 'A female physical therapist standing confidently in a rehabilitation clinic.' },
]

const loginCaptions = [
  { title: 'Care works better together.', tip: 'Team tip: Consistency between visits helps progress stick.' },
  { title: 'Progress, one step at a time.', tip: 'Quick tip: Move slowly and stay within a comfortable range.' },
  { title: 'Small movements. Meaningful progress.', tip: 'Recovery reminder: Small, consistent movements add up.' },
  { title: 'Every milestone counts.', tip: 'Quick tip: Focus on steady progress rather than perfect progress.' },
  { title: 'Move with purpose.', tip: 'Recovery reminder: Controlled movement builds confidence.' },
  { title: 'Your care team is here.', tip: 'Team tip: Share questions and feedback at every visit.' },
  { title: 'Strong habits support strong recoveries.', tip: 'Quick tip: Short, consistent practice sessions are easier to maintain.' },
]

function getRandomIndex(length: number, excludedIndex?: number) {
  if (length <= 1) return 0

  let randomIndex = Math.floor(Math.random() * length)
  while (randomIndex === excludedIndex) randomIndex = Math.floor(Math.random() * length)
  return randomIndex
}

export function LoginPage() {
  useRedirectIfAuthenticated()
  const { login, verifyMfaLogin, cancelMfaLogin, mfaChallengePending, authError, logoutState, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('lebron.james@milestone.example')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaError, setMfaError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [imageIndex, setImageIndex] = useState(() => getRandomIndex(loginImages.length))
  const [captionIndex, setCaptionIndex] = useState(() => getRandomIndex(loginCaptions.length))

  useEffect(() => {
    const imageTimer = window.setInterval(() => {
      setImageIndex((currentIndex) => (currentIndex + 1) % loginImages.length)
      setCaptionIndex((currentIndex) => getRandomIndex(loginCaptions.length, currentIndex))
    }, 10000)

    return () => window.clearInterval(imageTimer)
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    if (!email.trim() || !email.includes('@')) return setError('Enter a valid email address.')
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    setLoading(true)
    try {
      const result = await login(email, password)
      if (result.status === 'signed-in') {
        navigate((location.state as { from?: string } | null)?.from ?? '/dashboard', { replace: true })
      }
      // 'mfa-required': mfaChallengePending flips true and the form below swaps to the code step.
    } catch (submissionError) {
      setError(errorMessage(submissionError, 'Unable to sign in.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMfaError('')
    if (!/^\d{6}$/.test(mfaCode)) return setMfaError('Enter the 6-digit code from your authenticator app.')
    setVerifying(true)
    try {
      await verifyMfaLogin(mfaCode)
      navigate((location.state as { from?: string } | null)?.from ?? '/dashboard', { replace: true })
    } catch (verifyError) {
      setMfaError(errorMessage(verifyError, 'Unable to verify your code. Please try again.'))
    } finally {
      setVerifying(false)
    }
  }

  async function handleCancelMfa() {
    await cancelMfaLogin()
    setMfaCode('')
    setMfaError('')
  }

  return <Box className="login-page" minHeight={{ xs: '100dvh', md: 0 }} height={{ xs: 'auto', md: '100dvh' }} overflow={{ xs: 'visible', md: 'hidden' }} sx={{ bgcolor: '#e8ddba' }}>
    <Grid container className="login-layout" height={{ xs: 'auto', md: '100%' }} minHeight={{ xs: 'auto', md: 0 }}>
      <Grid className="login-image-grid" size={{ xs: 12, md: 7 }}>
        <Box className="login-image-panel" sx={{ height: { xs: 330, sm: 480, md: '100%' }, position: 'relative', overflow: 'hidden', bgcolor: '#e8ddba' }}>
          <Box className="login-image-stage">
            {loginImages.map((image, index) => <Box key={image.src} component="img" className={`login-image-fade${index === imageIndex ? ' login-image-active' : ''}`} src={image.src} alt={image.alt} sx={{ width: '100%', height: '100%', objectFit: { xs: 'cover', md: 'cover' }, objectPosition: { xs: 'center 22%', md: 'center top' }, display: 'block' }} />)}
          </Box>
          <Box className="login-image-overlay" />
          <Box className="login-brand" sx={{ position: 'absolute', top: { xs: 20, md: 34 }, left: { xs: 24, md: 48 }, zIndex: 1 }}><Brand light /></Box>
          <Box className="login-image-caption" aria-live="polite">
            <Typography variant="h6">{loginCaptions[captionIndex].title}</Typography>
            <Typography variant="body2">{loginCaptions[captionIndex].tip}</Typography>
          </Box>
        </Box>
      </Grid>

      <Grid className="login-form-grid" size={{ xs: 12, md: 5 }} display="flex" alignItems="center" sx={{ height: { xs: 'auto', md: '100%' }, minHeight: 0, overflowY: { xs: 'visible', md: 'auto' }, bgcolor: '#e8ddba' }}>
        <Container className="login-form-container" maxWidth={false} sx={{ py: { xs: 4, md: 6 }, px: { xs: 2.5, sm: 4, md: 0 } }}>
          <Paper component="form" onSubmit={mfaChallengePending ? handleVerifyMfa : handleSubmit} className="login-card" sx={{ p: { xs: 3, sm: 5, md: 6 }, borderRadius: { xs: 3, md: 4 } }}>
            <Box textAlign="center" mb={4}>
              {!mfaChallengePending && <Button component={RouterLink} to="/" startIcon={<ArrowBackIcon />} size="small" sx={{ mb: 2 }}>Back to main page</Button>}
              <Typography variant="h4" mb={1}>{mfaChallengePending ? 'Enter your code' : 'Welcome back'}</Typography>
              <Typography color="text.secondary">{mfaChallengePending ? 'Open your authenticator app and enter the 6-digit code.' : 'Sign in to your physical therapy workspace.'}</Typography>
            </Box>
            {authError && <Alert severity="error" sx={{ mb: 2 }}>{authError}</Alert>}
            {logoutState === 'pending' && <Alert severity="info" sx={{ mb: 2 }}>Signing out… Protected access is blocked.</Alert>}
            {logoutState === 'local' && <Alert severity="warning" sx={{ mb: 2 }}>Signed out of this browser. Global sign-out failed; other sessions may remain active.</Alert>}
            {logoutState === 'failed' && <Alert severity="error" sx={{ mb: 2 }} action={<Button type="button" onClick={() => void logout()}>Retry sign-out</Button>}>Sign-out failed. Protected access is blocked, but your session may still exist. Retry sign-out.</Alert>}
            {mfaChallengePending ? (
              <Stack spacing={3}>
                {mfaError && mfaError !== authError && <Alert severity="error">{mfaError}</Alert>}
                <TextField label="6-digit code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code" autoFocus required slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*', maxLength: 6 } }} />
                <Button type="submit" variant="contained" size="large" disabled={verifying}>{verifying ? <CircularProgress size={24} color="inherit" /> : 'Verify'}</Button>
                <Button type="button" size="small" onClick={handleCancelMfa} disabled={verifying}>Use a different account</Button>
              </Stack>
            ) : (
              <Stack spacing={3}>
                {error && error !== authError && <Alert severity="error">{error}</Alert>}
                <TextField label="Work email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
                <TextField label="Password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required InputProps={{ endAdornment: <InputAdornment position="end"><IconButton aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)} edge="end">{showPassword ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}</IconButton></InputAdornment> }} />
                <Box display="flex" justifyContent="flex-end"><Button size="small">Forgot password?</Button></Box>
                <Button type="submit" variant="contained" size="large" disabled={loading || logoutState === 'pending'}>{loading ? <CircularProgress size={24} color="inherit" /> : 'Sign in'}</Button>
                <Typography textAlign="center" variant="body2" color="text.secondary">Need an account? <Button component={RouterLink} to="/register" size="small">Create account</Button></Typography>
              </Stack>
            )}
          </Paper>
          <Typography textAlign="center" mt={3} variant="caption" color="text.secondary">Milestone prototype • No real patient data is used</Typography>
        </Container>
      </Grid>
    </Grid>
  </Box>
}
