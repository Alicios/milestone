import { useEffect, useState, type FormEvent } from 'react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import { Alert, Box, Button, CircularProgress, Container, Grid, IconButton, InputAdornment, Paper, Stack, TextField, Typography } from '@mui/material'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { useAuth } from '../auth/AuthContext'

const loginImages = [
  { src: '/login-therapists.png', alt: 'A male and female physical therapist standing back-to-back in a rehabilitation clinic.' },
  { src: '/login-therapist-male.png', alt: 'A male physical therapist standing confidently in a rehabilitation clinic.' },
  { src: '/login-therapist-female.png', alt: 'A female physical therapist standing confidently in a rehabilitation clinic.' },
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
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('maya.patel@milestone.example')
  const [password, setPassword] = useState('provider123')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
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
    try { await login(email, password); navigate('/dashboard', { replace: true }) } catch (submissionError) { setError(submissionError instanceof Error ? submissionError.message : 'Unable to sign in.') } finally { setLoading(false) }
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
          <Paper component="form" onSubmit={handleSubmit} className="login-card" sx={{ p: { xs: 3, sm: 5, md: 6 }, borderRadius: { xs: 3, md: 4 } }}>
            <Box textAlign="center" mb={4}>
              <Button component={RouterLink} to="/" startIcon={<ArrowBackIcon />} size="small" sx={{ mb: 2 }}>Back to main page</Button>
              <Typography variant="h4" mb={1}>Welcome back</Typography>
              <Typography color="text.secondary">Sign in to your physical therapy workspace.</Typography>
            </Box>
            <Stack spacing={3}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField label="Work email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
              <TextField label="Password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required InputProps={{ endAdornment: <InputAdornment position="end"><IconButton aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)} edge="end">{showPassword ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}</IconButton></InputAdornment> }} />
              <Box display="flex" justifyContent="flex-end"><Button size="small">Forgot password?</Button></Box>
              <Button type="submit" variant="contained" size="large" disabled={loading}>{loading ? <CircularProgress size={24} color="inherit" /> : 'Sign in'}</Button>
              <Typography textAlign="center" variant="body2" color="text.secondary">Need an account? <Button component={RouterLink} to="/register" size="small">Create account</Button></Typography>
            </Stack>
          </Paper>
          <Typography textAlign="center" mt={3} variant="caption" color="text.secondary">Milestone prototype • No real patient data is used</Typography>
        </Container>
      </Grid>
    </Grid>
  </Box>
}
