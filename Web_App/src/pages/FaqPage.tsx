import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Container, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { PublicHeader } from '../components/PublicHeader'

const questions = [
  { question: 'Who is Milestone for?', answer: 'Milestone connects physical therapy providers and their patients. Providers use the web workspace to manage care plans, the provider companion app to review activity on the go, and the patient app to follow assigned routines.' },
  { question: 'What can providers do in the web workspace?', answer: 'Providers can manage their patients, create and assign exercise routines, review progress and exercise feedback, and exchange messages with patients.' },
  { question: 'What is the provider companion app for?', answer: 'The companion app offers a mobile view of patients, recent routine activity, issues needing attention, and messages. Providers can also review patient schedules and make quick routine changes from their phone.' },
  { question: 'What do patients see?', answer: 'The patient app shows assigned routines, exercise instructions, daily progress, and messages. Patients can report how an exercise felt so their provider can review it.' },
  { question: 'How do providers and patients connect?', answer: 'A provider creates a patient invitation. After the patient completes setup, the provider and patient can view the care information available to their respective accounts.' },
  { question: 'Can I try the provider workspace?', answer: 'Use Create account to register as a provider, or Sign in if you already have an account. The screenshots on this site show sample data and do not display real patient records.' },
]

export function FaqPage() {
  return <Box minHeight="100vh" bgcolor="background.default">
    <PublicHeader />
    <Container component="main" maxWidth="md" sx={{ py: { xs: 6, md: 10 } }}>
      <Button component={RouterLink} to="/" startIcon={<ArrowBackIcon />} sx={{ mb: 4 }}>Back to home</Button>
      <Typography variant="overline" color="secondary.main" fontWeight={800} letterSpacing=".14em">Provider questions</Typography>
      <Typography variant="h1" sx={{ fontSize: { xs: '2.8rem', md: '4rem' }, mt: 1 }}>Frequently asked questions</Typography>
      <Typography color="text.secondary" lineHeight={1.7} sx={{ mt: 2, mb: 5, maxWidth: 650 }}>Learn how Milestone’s three apps help providers and patients stay connected between visits.</Typography>
      <Stack spacing={2}>
        {questions.map(({ question, answer }) => <Accordion key={question} disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '16px !important', overflow: 'hidden', '&:before': { display: 'none' } }}><AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: { xs: 2, sm: 3 }, py: 1 }}><Typography variant="h6" component="span" sx={{ fontSize: '1.08rem' }}>{question}</Typography></AccordionSummary><AccordionDetails sx={{ px: { xs: 2, sm: 3 }, pb: 3 }}><Typography color="text.secondary" lineHeight={1.75}>{answer}</Typography></AccordionDetails></Accordion>)}
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 6 }}><Button component={RouterLink} to="/register" variant="contained" size="large">Create account</Button><Button component={RouterLink} to="/login" variant="outlined" size="large">Sign in</Button></Stack>
    </Container>
  </Box>
}
