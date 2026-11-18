import { useState } from 'react'
import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography, useMediaQuery } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { Link as RouterLink } from 'react-router-dom'
import { publicAsset } from '../lib/assets'

const tutorials = [
  { title: 'Get started with your workspace', screenshot: 'patients', caption: 'The Patients page and main navigation.', steps: ['Use Patients to find the people in your care. Open a patient to see their details, calendar, and assigned routines.', 'Use Routines to manage reusable exercise plans and Messages to contact patients.', 'Open your profile picture for Profile, Settings, and Logout. Return to this guide anytime with the question-mark icon.'] },
  { title: 'Add a patient and help them sign in', screenshot: 'add-patient', caption: 'Add a patient with their name and email.', steps: ['Open Patients and choose Add patient. Enter the patient\'s name and email, then save.', 'Follow the patient setup page to obtain their one-time login code and share it directly with the patient.', 'The patient uses their email and code in the patient app to finish account setup. Check that you are sharing the code with the intended patient.'] },
  { title: 'Create and edit routines', screenshot: 'routines', caption: 'Find and manage saved routines.', steps: ['Open Routines and create a routine, or open an existing routine to edit it.', 'Name the routine, add exercises, and review each exercise\'s instructions, sets, repetitions, or time.', 'Review the preview and save. If an edit affects scheduled routines, read the impact summary before confirming.'] },
  { title: 'Schedule a routine and review progress', screenshot: 'patient-calendar', caption: 'Review a patient and their routine calendar.', steps: ['Open a patient and use their calendar to choose a date and schedule a routine.', 'Select a saved routine and review the dates before saving. Available dates follow the scheduling window shown in the app.', 'Return to the calendar to inspect assignments, completion, and patient feedback. Read reported difficulties even when a routine is completed.', 'Use the assignment\'s available actions to cancel an assignment or manage a follow-up.'] },
  { title: 'Send and find messages', screenshot: 'messages', caption: 'Start a message from the provider inbox.', steps: ['Open Messages and select a patient conversation.', 'Write your message and send it. Review any error before retrying.', 'Return to the inbox to switch patients or find another conversation.'] },
  { title: 'Update patient details and manage archived care', screenshot: 'patient-details', caption: 'Edit personal and care details.', steps: ['Open a patient to review their personal and care details. Use the editing controls on the website to make changes and save.', 'Use the Patient controls section for care relationship actions, including discharge. Read the confirmation before continuing.', 'Find discharged patients in the archive. Review the archived relationship and use reinstatement when care resumes.'] },
  { title: 'Profile, settings, and loading problems', screenshot: 'settings', caption: 'Choose your workspace appearance in Settings.', steps: ['Open your profile picture to update your profile or change settings such as appearance.', 'If a section fails to load, use its retry control. If a save succeeded but a refresh failed, retry loading rather than submitting the save again.', 'Use Logout from the profile menu when you finish on a shared device.'] },
]

export function TutorialPage() {
  const [query, setQuery] = useState('')
  const [zoomed, setZoomed] = useState(false)
  const compact = useMediaQuery('(max-width:599.95px)')
  const [screenshot, setScreenshot] = useState<(typeof tutorials)[number] | null>(null)
  const [expanded, setExpanded] = useState<string | false>(tutorials[0].title)
  const matches = tutorials.filter(topic => `${topic.title} ${topic.steps.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <Box sx={{ maxWidth: 900, mx: 'auto', pb: 3 }}>
    <Button component={RouterLink} to="/dashboard/patients" sx={{ mb: 2 }}>Back to patients</Button>
    <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>Help &amp; tutorials</Typography>
    <Typography sx={{ mt: 1, mb: 3 }} color="text.secondary">New to Milestone or need a refresher? Choose a topic for a step-by-step guide to the provider website.</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Screenshots use sample data. Select an image to enlarge it.</Typography>
    <TextField fullWidth label="Search tutorials" helperText="Try routines, patients, or messages" value={query} onChange={event => setQuery(event.target.value)} sx={{ mb: 3 }} />
    <Stack spacing={1}>
      {matches.map((topic, index) => <Accordion key={topic.title} disableGutters expanded={expanded === topic.title} onChange={(_, open) => setExpanded(open ? topic.title : false)}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} id={`tutorial-${index}`} aria-controls={`tutorial-content-${index}`}><Typography component="h2" sx={{ fontSize: '1.1rem', fontWeight: 700 }}>{topic.title}</Typography></AccordionSummary>
        <AccordionDetails id={`tutorial-content-${index}`}><Box component="ol" sx={{ m: 0, pl: 3, '& li': { pb: 1.5, lineHeight: 1.7 } }}>{topic.steps.map(step => <li key={step}>{step}</li>)}</Box><Box component="figure" sx={{ m: 0, mt: 1 }}><Box component="button" type="button" aria-label={`Enlarge screenshot: ${topic.caption}`} onClick={() => { setZoomed(false); setScreenshot(topic) }} sx={{ display: 'block', width: '100%', p: 0, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden', cursor: 'zoom-in', bgcolor: 'background.paper', '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 3 } }}><Box component="img" src={publicAsset(`tutorials/${topic.screenshot}.png`)} alt={topic.caption} loading="lazy" width={1365} height={900} sx={{ display: 'block', width: '100%', height: 'auto' }} /></Box><Typography component="figcaption" variant="body2" color="text.secondary" sx={{ mt: 1 }}>{topic.caption}</Typography></Box></AccordionDetails>
      </Accordion>)}
      {!matches.length && <Typography role="status">No tutorials found. Try another word or clear your search.</Typography>}
    </Stack>
    <Dialog open={Boolean(screenshot)} onClose={() => setScreenshot(null)} maxWidth="xl" fullWidth fullScreen={compact} aria-labelledby="tutorial-screenshot-title">
      <DialogTitle id="tutorial-screenshot-title">{screenshot?.caption}</DialogTitle>
      <DialogContent sx={{ overflow: 'auto' }}>{screenshot && <Box component="img" src={publicAsset(`tutorials/${screenshot.screenshot}.png`)} alt={screenshot.caption} sx={{ display: 'block', width: zoomed ? 1365 : '100%', maxWidth: zoomed ? 'none' : '100%', maxHeight: zoomed ? 'none' : '75vh', objectFit: 'contain' }} />}</DialogContent>
      <DialogActions><Button onClick={() => setZoomed(value => !value)}>{zoomed ? 'Fit to screen' : 'Zoom in'}</Button><Button onClick={() => setScreenshot(null)}>Close screenshot</Button></DialogActions>
    </Dialog>
  </Box>
}

