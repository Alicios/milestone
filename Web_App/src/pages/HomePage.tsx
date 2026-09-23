import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined'
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined'
import type { SvgIconComponent } from '@mui/icons-material'
import { Box, Button, Card, CardContent, Container, Grid, Paper, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { PublicHeader } from '../components/PublicHeader'
import { Brand } from '../components/Brand'

type Feature = { eyebrow: string; title: string; body: string; image: string; alt: string; icon: SvgIconComponent }

const featureSections: Feature[] = [
  { eyebrow: 'Manage every routine', title: 'Keep each patient’s plan clear and actionable.', body: 'Create personalized exercise routines, assign them to the right days, and keep patient progress visible in one organized workspace for your care team.', image: '/Therapy-Instagram-Post-Template-Website-1-1024x576.webp', alt: 'A therapist helping a patient exercise in a bright physical therapy clinic.', icon: InsightsOutlinedIcon },
  { eyebrow: 'Coordinate between visits', title: 'Stay connected beyond the clinic.', body: 'Milestone gives providers a shared place for patient updates, messages, and next steps so care can continue without relying on paperwork, extra visits, or scattered email threads.', image: '/telehealth-physical-therapy-1.webp', alt: 'A therapist supporting a patient through a remote exercise session on a tablet.', icon: ForumOutlinedIcon },
]

const workflowSteps = [
  ['01', 'Create a routine', 'Build a personalized exercise plan for each patient.'],
  ['02', 'Assign the right days', 'Give patients a clear schedule to follow between visits.'],
  ['03', 'Track the journey', 'Keep updates and progress connected as care continues.'],
]

const resources = [
  { title: 'Personalized routines', body: 'Create exercise plans that reflect each patient’s goals and care needs.', icon: AutoAwesomeOutlinedIcon },
  { title: 'Clear daily guidance', body: 'The future patient app will show which routines to complete on assigned days.', icon: CalendarMonthOutlinedIcon },
  { title: 'Connected care', body: 'Coordinate updates and communication without relying on disconnected tools.', icon: ForumOutlinedIcon },
]

export function HomePage() {
  return <Box className="home-page" minHeight="100vh" bgcolor="background.default">
    <PublicHeader />
    <Box component="main">
      <Container maxWidth="lg">
        <Grid container spacing={{ xs: 5, md: 8 }} alignItems="center" sx={{ py: { xs: 7, md: 12 } }}>
          <Grid size={{ xs: 12, md: 5 }}>
            <Reveal>
              <Typography variant="overline" color="secondary.main" fontWeight={800} letterSpacing=".14em">Exercise care, connected</Typography>
              <Typography variant="h1" sx={{ fontSize: { xs: '2.8rem', md: '4.5rem' }, mt: 1, mb: 3 }}>Make every routine count.</Typography>
              <Typography variant="h6" color="text.secondary" fontWeight={400} lineHeight={1.6}>Milestone helps physical therapy providers create, assign, and manage personalized exercise routines while coordinating patient care between visits.</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mt={4}>
                <Button component={RouterLink} to="/login" variant="contained" size="large" endIcon={<ArrowForwardIcon />}>Enter therapist portal</Button>
                <Button component={RouterLink} to="/register" variant="outlined" size="large">Create account</Button>
              </Stack>
            </Reveal>
          </Grid>
          <Grid size={{ xs: 12, md: 7 }}>
            <Reveal delay={120}>
              <Box className="home-hero-image" sx={{ position: 'relative', minHeight: { xs: 320, sm: 430, md: 510 }, borderRadius: { xs: 4, md: 6 }, overflow: 'hidden', boxShadow: '0 24px 60px rgba(11, 61, 80, .2)' }}>
                <ParallaxImage src="/physical-therapy.webp" alt="A physical therapist guiding an older patient through a strengthening exercise." />
                <Paper sx={{ position: 'absolute', left: { xs: 16, md: 28 }, bottom: { xs: 16, md: 28 }, p: 2, maxWidth: 245, borderRadius: 3, bgcolor: 'rgba(255,255,255,.92)' }}>
                  <Typography variant="caption" color="secondary.main" fontWeight={800} textTransform="uppercase">A clearer care plan</Typography>
                  <Typography fontWeight={700} mt={0.5}>Personalized routines. Connected care.</Typography>
                </Paper>
              </Box>
            </Reveal>
          </Grid>
        </Grid>

        <Box id="features" component="section" className="home-anchor" sx={{ py: { xs: 7, md: 12 } }}>
          <Reveal><Typography variant="overline" color="secondary.main" fontWeight={800} letterSpacing=".14em">Built for the whole team</Typography><Typography variant="h2" sx={{ mt: 1, maxWidth: 700, fontSize: { xs: '2.2rem', md: '3.4rem' } }}>The right information, at the right moment.</Typography></Reveal>
          <Stack spacing={{ xs: 8, md: 12 }} mt={{ xs: 6, md: 9 }}>
            {featureSections.map((feature, index) => { const Icon = feature.icon; return <Grid container spacing={{ xs: 4, md: 8 }} alignItems="center" key={feature.title} direction={{ xs: 'column', md: index % 2 ? 'row-reverse' : 'row' }}>
              <Grid size={{ xs: 12, md: 6 }}><Reveal delay={index * 80}><Box sx={{ overflow: 'hidden', borderRadius: { xs: 4, md: 5 }, aspectRatio: '4 / 3', boxShadow: '0 18px 45px rgba(11, 61, 80, .14)' }}><ParallaxImage src={feature.image} alt={feature.alt} /></Box></Reveal></Grid>
              <Grid size={{ xs: 12, md: 6 }}><Reveal delay={index * 120 + 100}><Stack spacing={2}><Icon color="secondary" sx={{ fontSize: 42 }} /><Typography variant="overline" color="secondary.main" fontWeight={800} letterSpacing=".14em">{feature.eyebrow}</Typography><Typography variant="h3" sx={{ fontSize: { xs: '2rem', md: '2.7rem' } }}>{feature.title}</Typography><Typography color="text.secondary" lineHeight={1.8} fontSize="1.08rem">{feature.body}</Typography></Stack></Reveal></Grid>
            </Grid> })}
          </Stack>
        </Box>

        <Box id="how-it-works" component="section" className="home-anchor" sx={{ py: { xs: 7, md: 12 } }}>
          <Reveal><Paper sx={{ p: { xs: 3, md: 7 }, bgcolor: 'primary.dark', color: 'white', borderRadius: { xs: 4, md: 6 }, overflow: 'hidden', position: 'relative' }}>
            <Box sx={{ position: 'relative', zIndex: 1 }}><Typography variant="overline" color="secondary.light" fontWeight={800} letterSpacing=".14em">How it works</Typography><Typography variant="h2" sx={{ mt: 1, maxWidth: 620, fontSize: { xs: '2.2rem', md: '3.4rem' } }}>A simpler way to continue care.</Typography><Typography sx={{ mt: 2, maxWidth: 600, color: 'rgba(255,255,255,.76)', lineHeight: 1.7 }}>Build the plan in the provider workspace, then give each patient a clear path to follow between appointments.</Typography><Grid container spacing={3} mt={{ xs: 3, md: 5 }}>{workflowSteps.map(([number, title, body]) => <Grid size={{ xs: 12, md: 4 }} key={number}><Box sx={{ borderTop: '1px solid rgba(255,255,255,.25)', pt: 2 }}><Typography color="secondary.light" fontWeight={800}>{number}</Typography><Typography variant="h6" mt={1}>{title}</Typography><Typography sx={{ mt: 1, color: 'rgba(255,255,255,.7)', lineHeight: 1.6 }}>{body}</Typography></Box></Grid>)}</Grid></Box>
            <Box sx={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', bgcolor: 'secondary.main', opacity: .16, right: -90, bottom: -120 }} />
          </Paper></Reveal>
        </Box>

        <Box id="resources" component="section" className="home-anchor" sx={{ py: { xs: 7, md: 12 } }}>
          <Reveal><Typography variant="overline" color="secondary.main" fontWeight={800} letterSpacing=".14em">Built for connected care</Typography><Typography variant="h2" sx={{ mt: 1, maxWidth: 700, fontSize: { xs: '2.2rem', md: '3.4rem' } }}>Everything needed for the next step.</Typography><Typography color="text.secondary" lineHeight={1.7} maxWidth={620} mt={2}>Milestone keeps the provider’s plan and the patient’s next exercise steps moving in the same direction.</Typography></Reveal>
          <Grid container spacing={3} mt={4}>{resources.map(({ title, body, icon: Icon }) => <Grid size={{ xs: 12, md: 4 }} key={title}><Reveal><Card sx={{ height: '100%', borderRadius: 4 }}><CardContent sx={{ p: { xs: 3, md: 4 } }}><Icon color="secondary" sx={{ fontSize: 38 }} /><Typography variant="h6" mt={2}>{title}</Typography><Typography color="text.secondary" lineHeight={1.7} mt={1}>{body}</Typography></CardContent></Card></Reveal></Grid>)}</Grid>
        </Box>

          <Reveal><Paper component="section" sx={{ my: { xs: 6, md: 10 }, p: { xs: 4, md: 7 }, bgcolor: 'secondary.main', color: 'white', borderRadius: { xs: 4, md: 6 }, textAlign: 'center' }}><Typography variant="h2" sx={{ fontSize: { xs: '2.2rem', md: '3.5rem' } }}>Ready to coordinate better care?</Typography><Typography sx={{ mt: 2, color: 'rgba(255,255,255,.84)' }}>Enter the Milestone provider workspace or create an account for the front-end prototype.</Typography><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="center" spacing={2} mt={4}><Button component={RouterLink} to="/login" variant="contained" color="primary" size="large">Enter therapist portal</Button><Button component={RouterLink} to="/register" variant="outlined" sx={{ color: 'white', borderColor: 'rgba(255,255,255,.7)' }} size="large">Create account</Button></Stack></Paper></Reveal>
      </Container>
    </Box>
    <Box component="footer" sx={{ bgcolor: 'primary.dark', color: 'white' }}>
      <Container maxWidth="lg" sx={{ py: { xs: 2.5, md: 3 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <Brand light />
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.72)' }}>Connected care for every milestone.</Typography>
          </Stack>
          <Button component={RouterLink} to="/about" variant="outlined" sx={{ color: 'white', borderColor: 'rgba(255,255,255,.6)' }}>About us</Button>
        </Stack>
        <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'rgba(255,255,255,.58)' }}>© 2026 LeTeam. The Prototype Experience.</Typography>
      </Container>
    </Box>
  </Box>
}

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } }, { threshold: 0.12 })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return <Box ref={ref} className={visible ? 'home-reveal home-reveal-visible' : 'home-reveal'} sx={{ transitionDelay: `${delay}ms` }}>{children}</Box>
}

function ParallaxImage({ src, alt }: { src: string; alt: string }) {
  const [offset, setOffset] = useState(0)
  const ref = useRef<HTMLImageElement>(null)

  useEffect(() => {
    let frame = 0
    const update = () => {
      if (ref.current) {
        const rect = ref.current.parentElement?.getBoundingClientRect()
        if (rect) setOffset(Math.max(-18, Math.min(18, (window.innerHeight / 2 - (rect.top + rect.height / 2)) * 0.035)))
      }
      frame = 0
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (frame) cancelAnimationFrame(frame) }
  }, [])

  return <Box component="img" ref={ref} src={src} alt={alt} sx={{ width: '100%', height: 'calc(100% + 36px)', objectFit: 'cover', display: 'block', transform: `translateY(${offset}px)`, transition: 'transform 120ms linear' }} />
}
