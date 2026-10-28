import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link as RouterLink, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import EventOutlinedIcon from '@mui/icons-material/EventOutlined'
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined'
import PersonRemoveOutlinedIcon from '@mui/icons-material/PersonRemoveOutlined'
import { Alert, Box, Button, Card, Chip, Divider, Link, MenuItem, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import { CalendarWeekNavigation } from '../components/CalendarWeekNavigation'
import { withinHorizon } from '../lib/scheduling'
import { prescriptionSummary } from '../lib/prescriptions'
import { inviteExistingPatient } from '../lib/supabaseData'
import { errorMessage } from '../lib/errors'
import type { DashboardOutletContext } from '../components/DashboardLayout'
import { PatientDetailsDialog } from '../components/PatientDetailsDialog'
import { DischargePatientDialog } from '../components/DischargePatientDialog'
import { FollowUpDialog } from '../components/FollowUpDialog'
import { PatientAvatar } from '../components/PatientAvatar'
import { RemoveRoutineDialog } from '../components/RemoveRoutineDialog'
import { weekdayNames, type Patient } from '../data/mockPatients'
import { formatCalendarDate } from '../lib/week'
import type { RoutineAssignment } from '../types'

function Detail({ label, children }: { label: string; children?: ReactNode }) {
  return <Box sx={{ minWidth: 0 }}>
    <Typography component="dt" variant="body2" color="text.secondary" sx={{ mb: .5 }}>{label}</Typography>
    <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>{children || 'Not provided'}</Typography>
  </Box>
}

function PatientOverview({ patient }: { patient: Patient }) {
  const { assignments, weekDates, policy, occupied, setWeek, assignmentsLoading, openSchedule, cancelAssignment, scheduleFollowUp, cancelFollowUp, completeFollowUp, dischargePatient } = useOutletContext<DashboardOutletContext>()
  const navigate = useNavigate()
  const heading = useRef<HTMLHeadingElement>(null)
  const [selectedDay, setSelectedDay] = useState(0)
  const [removal, setRemoval] = useState<RoutineAssignment | null>(null)
  const [followUpAssignment, setFollowUpAssignment] = useState<RoutineAssignment | null>(null)
  const [editingDetails, setEditingDetails] = useState(false)
  const [confirmDischarge, setConfirmDischarge] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteMessage, setInviteMessage] = useState<{ text: string; severity: 'success' | 'error' } | null>(null)
  const [otp, setOtp] = useState(patient.pendingOtpCode ?? '')

  const otpExpired = Boolean(patient.pendingOtpExpiresAt) && new Date(patient.pendingOtpExpiresAt as string).getTime() <= Date.now()
  const displayedOtp = otp || (!otpExpired ? patient.pendingOtpCode ?? '' : '')

  async function invitePatient() {
    setInviting(true)
    setInviteMessage(null)
    try {
      const code = await inviteExistingPatient(patient.id)
      setOtp(code.otp)
      setInviteMessage({ text: 'Login code generated below.', severity: 'success' })
    } catch (inviteError) {
      setInviteMessage({ text: errorMessage(inviteError, 'The code could not be generated.'), severity: 'error' })
    } finally {
      setInviting(false)
    }
  }
  const patientAssignments = assignments[patient.profileId] ?? {}
  const startOfCare = patient.startOfCare
    ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(patient.startOfCare))
    : undefined

  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  return <>
    {editingDetails && <PatientDetailsDialog patient={patient} onClose={() => setEditingDetails(false)} onSaved={() => { setEditingDetails(false); setFeedback('Patient details saved.'); setInviteMessage(null) }} />}
    <Card sx={{ p: { xs: 2.5, sm: 3 }, mb: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between">
        <Stack direction="row" spacing={{ xs: 1.5, sm: 2 }} alignItems="center" minWidth={0}>
          <PatientAvatar name={patient.name} size="large" />
          <Box minWidth={0}>
            <Typography variant="overline" color="text.secondary">Patient overview</Typography>
            <Typography ref={heading} tabIndex={-1} component="h1" variant="h3" sx={{ fontSize: { xs: '1.8rem', sm: '2.5rem' }, overflowWrap: 'anywhere' }}>{patient.name}</Typography>
          </Box>
        </Stack>
        <Chip label={patient.careStatus === 'active' ? 'Active patient' : 'Pending patient'} color={patient.careStatus === 'active' ? 'success' : 'default'} variant="outlined" sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }} />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ sm: 'center' }} sx={{ mt: 1.5 }}>
        <Typography color="text.secondary">Start of care: {startOfCare || 'Not provided'}</Typography>
        <Button variant="outlined" onClick={() => setEditingDetails(true)}>Edit patient details</Button>
      </Stack>
    </Card>

    <Tabs value="overview" aria-label="Patient sections" sx={{ borderBottom: 1, borderColor: 'divider', mb: 1 }}>
      <Tab value="overview" id="patient-overview-tab" aria-controls="patient-overview-panel" label="Overview" sx={{ px: { xs: 1, sm: 2 } }} />
      <Tab disabled label="Notes · Coming Soon" sx={{ px: { xs: 1, sm: 2 } }} />
    </Tabs>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Session notes are coming soon.</Typography>

    <Box role="tabpanel" id="patient-overview-panel" aria-labelledby="patient-overview-tab" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.5fr) minmax(0, 1fr)' }, gap: 2.5, alignItems: 'start' }}>
      <Stack spacing={2.5} minWidth={0}>
        <Card component="section" aria-labelledby="patient-care-heading" sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Typography id="patient-care-heading" component="h2" variant="h6" sx={{ mb: 2 }}>Care overview</Typography>
          <Stack component="dl" spacing={2.5} sx={{ m: 0 }}>
            <Detail label="Primary concern">{patient.primaryConcern}</Detail>
            <Detail label="Treatment focus">{patient.treatmentFocus}</Detail>
          </Stack>
        </Card>

        <Card component="section" aria-labelledby="patient-routines-heading" sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Typography id="patient-routines-heading" component="h2" variant="h6">Assigned routines</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: .5, mb: 2.5 }}>Dated routine prescriptions for the selected week. Assigned exercises remain unchanged if the template is edited later.</Typography>
          <CalendarWeekNavigation dates={weekDates} policy={policy} onChange={setWeek} />
          <Button variant="outlined" disabled={!policy || !weekDates.some((date) => withinHorizon(date, policy)) || assignmentsLoading} onClick={() => openSchedule(patient)}>Schedule week</Button>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
            <TextField select label="Routine date" value={weekDates.length ? selectedDay : ''} onChange={(event) => setSelectedDay(Number(event.target.value))} size="small" sx={{ flex: 1 }}>
              {weekDates.map((date, index) => <MenuItem key={date} value={index}>{weekdayNames[index]}, {formatCalendarDate(date)}</MenuItem>)}
            </TextField>
            <Button variant="contained" startIcon={<AddIcon />} disabled={assignmentsLoading || !withinHorizon(weekDates[selectedDay], policy) || (occupied[patient.profileId] ?? []).some((entry) => entry.date === weekDates[selectedDay])} onClick={() => openSchedule(patient, weekDates[selectedDay])} sx={{ flexShrink: 0 }}>Assign Routine</Button>
          </Stack>
          <Typography role="status" variant="body2" color="success.main" sx={{ mt: feedback ? 1.5 : 0 }}>{feedback}</Typography>

          <Stack component="ul" spacing={0} divider={<Divider component="li" role="presentation" />} sx={{ listStyle: 'none', m: 0, mt: 2, p: 0 }}>
            {weekDates.map((date, index) => {
              const dayAssignments = patientAssignments[date] ?? []
              return <Box component="li" key={date} sx={{ py: 2 }}>
                <Typography fontWeight={700}>{weekdayNames[index]}, {formatCalendarDate(date)}</Typography>
                {!dayAssignments.length && <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{assignmentsLoading ? 'Loading…' : (occupied[patient.profileId] ?? []).some((entry) => entry.date === date) ? 'This date already has an active assignment. Contact the assigning provider before replacing it.' : 'No routine assigned'}</Typography>}
                <Stack spacing={1.5} sx={{ mt: dayAssignments.length ? 1.25 : 0 }}>
                  {dayAssignments.map((assignment) => <Card key={assignment.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
                      <Box minWidth={0}>
                        <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{assignment.routineName}</Typography>
                        {!assignment.exercises.length && <Typography variant="body2">No exercises listed</Typography>}
                        {assignment.exercises.map((exercise) => <Box key={exercise.id} sx={{ mt: .5 }}>
                          <Typography variant="body2">{exercise.name}{prescriptionSummary(exercise) && ` · ${prescriptionSummary(exercise)}`}</Typography>
                          {exercise.notes && <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{exercise.notes}</Typography>}
                        </Box>)}
                        {assignment.followUp?.status === 'scheduled' ? <Typography variant="body2" sx={{ mt: 1 }}><strong>Follow-up:</strong> {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(assignment.followUp.scheduledAt))}</Typography> : assignment.followUp?.status === 'completed' ? <Typography variant="body2" color="success.main" sx={{ mt: 1 }}>Follow-up completed</Typography> : <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>Follow-up needs scheduling</Typography>}
                      </Box>
                      <Stack alignItems={{ xs: 'flex-start', sm: 'flex-end' }} spacing={.75} sx={{ flexShrink: 0 }}>
                        <Chip size="small" variant="outlined" label={assignment.status} color="primary" />
                        {assignment.followUp?.status !== 'completed' && <Button size="small" startIcon={<EventOutlinedIcon />} onClick={() => setFollowUpAssignment(assignment)}>{assignment.followUp?.status === 'scheduled' ? 'Reschedule' : 'Schedule follow-up'}</Button>}
                        {assignment.followUp?.status === 'scheduled' && <><Button size="small" color="success" onClick={() => void completeFollowUp(assignment.id).then(() => setFeedback('Follow-up marked complete.')).catch((followUpError: Error) => setError(errorMessage(followUpError, 'The follow-up could not be updated.')))}>Mark follow-up complete</Button><Button size="small" color="warning" onClick={() => void cancelFollowUp(assignment.id).then(() => setFeedback('Follow-up cancelled.')).catch((followUpError: Error) => setError(errorMessage(followUpError, 'The follow-up could not be updated.')))}>Cancel follow-up</Button></>}
                        <Button size="small" color="error" onClick={() => setRemoval(assignment)}>Cancel assignment</Button>
                      </Stack>
                    </Stack>
                  </Card>)}
                </Stack>
              </Box>
            })}
          </Stack>
        </Card>
      </Stack>

      <Stack spacing={2.5} minWidth={0}>
        <Card component="section" aria-labelledby="patient-contact-heading" sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Typography id="patient-contact-heading" component="h2" variant="h6" sx={{ mb: 2 }}>Patient information</Typography>
          <Stack component="dl" spacing={2.5} sx={{ m: 0 }}>
            <Detail label="Email">{patient.email && <Link href={`mailto:${patient.email}`}>{patient.email}</Link>}</Detail>
            <Detail label="Phone">{patient.phone && <Link href={`tel:${patient.phone.replace(/[^\d+]/g, '')}`}>{patient.phone}</Link>}</Detail>
            <Detail label="Start of care">{startOfCare && <time dateTime={patient.startOfCare}>{startOfCare}</time>}</Detail>
          </Stack>
        </Card>
        <Card component="section" aria-labelledby="patient-actions-heading" sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Typography id="patient-actions-heading" component="h2" variant="h6" sx={{ mb: 1 }}>Patient actions</Typography>
          <Stack spacing={1.5} sx={{ mb: 2 }}>
            {patient.hasAccount && <Typography variant="body2" color="success.main">This patient has an account.</Typography>}
            <Typography variant="body2" color="text.secondary">
              {!patient.email ? 'Add an email address before generating a login code.' : patient.hasAccount ? 'Generate a new login code for this patient, e.g. for a new device.' : 'Generate this patient a login code to set up their account.'}
            </Typography>
            {inviteMessage && <Alert severity={inviteMessage.severity} onClose={() => setInviteMessage(null)}>{inviteMessage.text}</Alert>}
            {displayedOtp && <Card variant="outlined" sx={{ p: 2, alignSelf: 'flex-start' }}>
              <Typography variant="body2" color="text.secondary">Give this code to the patient:</Typography>
              <Typography sx={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '4px' }}>{displayedOtp}</Typography>
              <Typography variant="body2" color="text.secondary">They'll enter it in the Milestone app. It clears here once they verify, or expires in about an hour.</Typography>
            </Card>}
            <Button variant="outlined" startIcon={<VpnKeyOutlinedIcon />} disabled={!patient.email || inviting} onClick={() => void invitePatient()} sx={{ alignSelf: 'flex-start' }}>
              {inviting ? 'Generating…' : patient.hasAccount ? 'Send New Login Code' : 'Invite to App'}
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Discharge this patient to hide them from active care while retaining their clinical history.</Typography>
          <Button variant="outlined" color="error" startIcon={<PersonRemoveOutlinedIcon />} onClick={() => setConfirmDischarge(true)}>Discharge Patient</Button>
        </Card>
      </Stack>
    </Box>

    {removal && <RemoveRoutineDialog patientName={patient.name} weekday={formatCalendarDate(removal.scheduledDate)} routineName={removal.routineName} onCancel={() => setRemoval(null)} onRemove={async () => {
      await cancelAssignment(removal.id)
      setFeedback(`${removal.routineName} cancelled for ${formatCalendarDate(removal.scheduledDate)}.`)
      setError('')
      setRemoval(null)
    }} />}
    {followUpAssignment && <FollowUpDialog assignment={followUpAssignment} onCancel={() => setFollowUpAssignment(null)} onSave={async (scheduledAt) => {
      await scheduleFollowUp(followUpAssignment.id, scheduledAt)
      setFeedback(`Follow-up scheduled for ${followUpAssignment.routineName}.`)
      setError('')
      setFollowUpAssignment(null)
    }} />}
    {confirmDischarge && <DischargePatientDialog patientName={patient.name} onCancel={() => setConfirmDischarge(false)} onDischarge={() => {
      void dischargePatient(patient.id).then(() => navigate('/dashboard/patients', { replace: true })).catch((dischargeError: Error) => {
        setError(errorMessage(dischargeError, 'The patient could not be discharged.'))
        setConfirmDischarge(false)
      })
    }} />}
  </>
}

export function PatientPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const { patients, patientsLoading, patientsError, retryPatients } = useOutletContext<DashboardOutletContext>()
  const patient = patients.find((item) => item.id === patientId)

  return <Box component="main" maxWidth={1100} mx="auto" py={{ xs: 1, md: 2 }}>
    <Button component={RouterLink} to="/dashboard/patients" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>Back to Patients</Button>
    {patientsLoading ? <Alert severity="info">Loading patient…</Alert>
      : patientsError ? <Alert severity="error" action={<Button color="inherit" onClick={retryPatients}>Retry patients</Button>}>{patientsError}</Alert>
      : patient ? <PatientOverview key={patient.id} patient={patient} /> : <Card sx={{ p: { xs: 3, sm: 5 } }} role="status">
      <Typography component="h1" variant="h4" sx={{ mb: 1 }}>Patient not found</Typography>
      <Typography color="text.secondary">This patient is not in your active list. They may have been discharged, or the link may be incorrect.</Typography>
      <Button component={RouterLink} to="/dashboard/patients" variant="contained" sx={{ mt: 3 }}>Return to Patients</Button>
    </Card>}
  </Box>
}
