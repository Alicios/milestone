import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link as RouterLink, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import EventOutlinedIcon from '@mui/icons-material/EventOutlined'
import PersonRemoveOutlinedIcon from '@mui/icons-material/PersonRemoveOutlined'
import { Alert, Box, Button, Card, Chip, Divider, Link, MenuItem, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import { AssignRoutineDialog } from '../components/AssignRoutineDialog'
import type { DashboardOutletContext } from '../components/DashboardLayout'
import { DischargePatientDialog } from '../components/DischargePatientDialog'
import { FollowUpDialog } from '../components/FollowUpDialog'
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
  const { routines, assignments, weekDates, assignRoutine, cancelAssignment, scheduleFollowUp, cancelFollowUp, completeFollowUp, dischargePatient } = useOutletContext<DashboardOutletContext>()
  const navigate = useNavigate()
  const heading = useRef<HTMLHeadingElement>(null)
  const [selectedDay, setSelectedDay] = useState(0)
  const [assignmentDay, setAssignmentDay] = useState<number | null>(null)
  const [removal, setRemoval] = useState<RoutineAssignment | null>(null)
  const [followUpAssignment, setFollowUpAssignment] = useState<RoutineAssignment | null>(null)
  const [confirmDischarge, setConfirmDischarge] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const patientAssignments = assignments[patient.profileId] ?? {}
  const startOfCare = patient.startOfCare
    ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(patient.startOfCare))
    : undefined

  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  return <>
    <Card sx={{ p: { xs: 2.5, sm: 3 }, mb: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between">
        <Box minWidth={0}>
          <Typography variant="overline" color="text.secondary">Patient overview</Typography>
          <Typography ref={heading} tabIndex={-1} component="h1" variant="h3" sx={{ fontSize: { xs: '1.8rem', sm: '2.5rem' }, overflowWrap: 'anywhere' }}>{patient.name}</Typography>
        </Box>
        <Chip label={patient.careStatus === 'active' ? 'Active patient' : 'Pending patient'} color={patient.careStatus === 'active' ? 'success' : 'default'} variant="outlined" sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }} />
      </Stack>
      <Typography color="text.secondary" sx={{ mt: 1.5 }}>Start of care: {startOfCare || 'Not provided'}</Typography>
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
          <Typography variant="body2" color="text.secondary" sx={{ mt: .5, mb: 2.5 }}>Dated routine prescriptions for the current week. Assigned exercises remain unchanged if the template is edited later.</Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
            <TextField select label="Routine date" value={selectedDay} onChange={(event) => setSelectedDay(Number(event.target.value))} size="small" sx={{ flex: 1 }}>
              {weekDates.map((date, index) => <MenuItem key={date} value={index}>{weekdayNames[index]}, {formatCalendarDate(date)}</MenuItem>)}
            </TextField>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAssignmentDay(selectedDay)} sx={{ flexShrink: 0 }}>Assign Routine</Button>
          </Stack>
          <Typography role="status" variant="body2" color="success.main" sx={{ mt: feedback ? 1.5 : 0 }}>{feedback}</Typography>

          <Stack component="ul" spacing={0} divider={<Divider component="li" role="presentation" />} sx={{ listStyle: 'none', m: 0, mt: 2, p: 0 }}>
            {weekDates.map((date, index) => {
              const dayAssignments = patientAssignments[date] ?? []
              return <Box component="li" key={date} sx={{ py: 2 }}>
                <Typography fontWeight={700}>{weekdayNames[index]}, {formatCalendarDate(date)}</Typography>
                {!dayAssignments.length && <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>No routine assigned</Typography>}
                <Stack spacing={1.5} sx={{ mt: dayAssignments.length ? 1.25 : 0 }}>
                  {dayAssignments.map((assignment) => <Card key={assignment.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
                      <Box minWidth={0}>
                        <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{assignment.routineName}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>
                          {assignment.exercises.length ? assignment.exercises.map((exercise) => exercise.name).join(' · ') : 'No exercises listed'}
                        </Typography>
                        {assignment.followUp?.status === 'scheduled' ? <Typography variant="body2" sx={{ mt: 1 }}><strong>Follow-up:</strong> {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(assignment.followUp.scheduledAt))}</Typography> : assignment.followUp?.status === 'completed' ? <Typography variant="body2" color="success.main" sx={{ mt: 1 }}>Follow-up completed</Typography> : <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>Follow-up needs scheduling</Typography>}
                      </Box>
                      <Stack alignItems={{ xs: 'flex-start', sm: 'flex-end' }} spacing={.75} sx={{ flexShrink: 0 }}>
                        <Chip size="small" variant="outlined" label={assignment.status} color="primary" />
                        {assignment.followUp?.status !== 'completed' && <Button size="small" startIcon={<EventOutlinedIcon />} onClick={() => setFollowUpAssignment(assignment)}>{assignment.followUp?.status === 'scheduled' ? 'Reschedule' : 'Schedule follow-up'}</Button>}
                        {assignment.followUp?.status === 'scheduled' && <><Button size="small" color="success" onClick={() => void completeFollowUp(assignment.id).then(() => setFeedback('Follow-up marked complete.')).catch((followUpError: Error) => setError(followUpError.message))}>Mark follow-up complete</Button><Button size="small" color="warning" onClick={() => void cancelFollowUp(assignment.id).then(() => setFeedback('Follow-up cancelled.')).catch((followUpError: Error) => setError(followUpError.message))}>Cancel follow-up</Button></>}
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
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Discharge this patient to hide them from active care while retaining their clinical history.</Typography>
          <Button variant="outlined" color="error" startIcon={<PersonRemoveOutlinedIcon />} onClick={() => setConfirmDischarge(true)}>Discharge Patient</Button>
        </Card>
      </Stack>
    </Box>

    {assignmentDay !== null && <AssignRoutineDialog patientName={patient.name} weekday={weekdayNames[assignmentDay]} scheduledDate={weekDates[assignmentDay]} routines={routines} onCancel={() => setAssignmentDay(null)} onAssign={async (routine) => {
      await assignRoutine(patient.profileId, weekDates[assignmentDay], routine.id)
      setFeedback(`${routine.name} assigned for ${weekdayNames[assignmentDay]}.`)
      setError('')
      setAssignmentDay(null)
    }} />}
    {removal && <RemoveRoutineDialog patientName={patient.name} weekday={formatCalendarDate(removal.scheduledDate)} routineName={removal.routineName} onCancel={() => setRemoval(null)} onRemove={() => {
      void cancelAssignment(removal.id).then(() => {
        setFeedback(`${removal.routineName} cancelled for ${formatCalendarDate(removal.scheduledDate)}.`)
        setError('')
        setRemoval(null)
      }).catch((removeError: Error) => setError(removeError.message))
    }} />}
    {followUpAssignment && <FollowUpDialog assignment={followUpAssignment} onCancel={() => setFollowUpAssignment(null)} onSave={async (scheduledAt) => {
      await scheduleFollowUp(followUpAssignment.id, scheduledAt)
      setFeedback(`Follow-up scheduled for ${followUpAssignment.routineName}.`)
      setError('')
      setFollowUpAssignment(null)
    }} />}
    {confirmDischarge && <DischargePatientDialog patientName={patient.name} onCancel={() => setConfirmDischarge(false)} onDischarge={() => {
      void dischargePatient(patient.id).then(() => navigate('/dashboard/patients', { replace: true })).catch((dischargeError: Error) => {
        setError(dischargeError.message)
        setConfirmDischarge(false)
      })
    }} />}
  </>
}

export function PatientPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const { patients } = useOutletContext<DashboardOutletContext>()
  const patient = patients.find((item) => item.id === patientId)

  return <Box component="main" maxWidth={1100} mx="auto" py={{ xs: 1, md: 2 }}>
    <Button component={RouterLink} to="/dashboard/patients" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>Back to Patients</Button>
    {patient ? <PatientOverview key={patient.id} patient={patient} /> : <Card sx={{ p: { xs: 3, sm: 5 } }} role="status">
      <Typography component="h1" variant="h4" sx={{ mb: 1 }}>Patient not found</Typography>
      <Typography color="text.secondary">This patient is not in your active list. They may have been discharged, or the link may be incorrect.</Typography>
      <Button component={RouterLink} to="/dashboard/patients" variant="contained" sx={{ mt: 3 }}>Return to Patients</Button>
    </Card>}
  </Box>
}
