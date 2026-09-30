import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link as RouterLink, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import PersonRemoveOutlinedIcon from '@mui/icons-material/PersonRemoveOutlined'
import { Box, Button, Card, Chip, Divider, Link, MenuItem, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import { AssignRoutineDialog } from '../components/AssignRoutineDialog'
import type { DashboardOutletContext } from '../components/DashboardLayout'
import { DischargePatientDialog } from '../components/DischargePatientDialog'
import { RemoveRoutineDialog } from '../components/RemoveRoutineDialog'
import { weekdayNames, type Patient } from '../data/mockPatients'

const activityLabels: Record<Patient['statuses'][number], string> = {
  missed: 'Missed', complete: 'Completed', modified: 'Modified', routine: 'Scheduled', none: 'Unassigned',
}

function Detail({ label, children }: { label: string; children?: ReactNode }) {
  return <Box sx={{ minWidth: 0 }}>
    <Typography component="dt" variant="body2" color="text.secondary" sx={{ mb: .5 }}>{label}</Typography>
    <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>{children || 'Not provided'}</Typography>
  </Box>
}

function PatientOverview({ patient }: { patient: Patient }) {
  const { assignments, assignRoutine, removeRoutine, dischargePatient } = useOutletContext<DashboardOutletContext>()
  const navigate = useNavigate()
  const heading = useRef<HTMLHeadingElement>(null)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [assignmentDay, setAssignmentDay] = useState<number | null>(null)
  const [removalDay, setRemovalDay] = useState<number | null>(null)
  const [confirmDischarge, setConfirmDischarge] = useState(false)
  const [feedback, setFeedback] = useState('')
  const patientAssignments = assignments[patient.id] ?? {}
  const availableDays = weekdayNames.flatMap((_, index) => patient.statuses[index] === 'none' && !patientAssignments[index] ? [index] : [])
  const dayToAssign = selectedDay !== null && availableDays.includes(selectedDay) ? selectedDay : availableDays[0]
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
          <Typography variant="body2" color="text.secondary" sx={{ mt: .5, mb: 2.5 }}>Weekly routines and activity, shared with your patient dashboard.</Typography>
          {availableDays.length > 0 ? <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
            <TextField select label="Routine day" value={dayToAssign} onChange={(event) => setSelectedDay(Number(event.target.value))} size="small" sx={{ flex: 1 }}>
              {availableDays.map((index) => <MenuItem key={index} value={index}>{weekdayNames[index]}</MenuItem>)}
            </TextField>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAssignmentDay(dayToAssign)} sx={{ flexShrink: 0 }}>Assign Routine</Button>
          </Stack> : <Box>
            <Button variant="contained" startIcon={<AddIcon />} disabled>Assign Routine</Button>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>All days already have a routine or recorded activity.</Typography>
          </Box>}
          <Typography role="status" variant="body2" color="success.main" sx={{ mt: feedback ? 1.5 : 0 }}>{feedback}</Typography>
          <Stack component="ul" spacing={0} divider={<Divider component="li" role="presentation" />} sx={{ listStyle: 'none', m: 0, mt: 2, p: 0 }}>
            {weekdayNames.map((day, index) => {
              const routine = patientAssignments[index]
              const status = patient.statuses[index]
              return <Box component="li" key={day} sx={{ py: 1.5, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontWeight={700} variant="body2">{day}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: .5, overflowWrap: 'anywhere' }}>
                    {routine?.name ?? (status === 'none' ? 'No routine assigned' : 'Routine details unavailable')}
                  </Typography>
                </Box>
                <Stack alignItems="flex-end" spacing={.5} sx={{ flexShrink: 0 }}>
                  <Chip size="small" variant="outlined" label={routine ? 'Assigned' : activityLabels[status]} color={routine ? 'primary' : 'default'} />
                  {(routine || status === 'routine') && <Button
                    size="small"
                    aria-label={`Remove ${routine?.name ?? 'scheduled routine'} from ${day}`}
                    onClick={() => setRemovalDay(index)}
                    sx={{ minWidth: 0, px: .5, py: 0, color: 'text.secondary' }}
                  >Remove</Button>}
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
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Discharge this patient to remove them from your active patient list.</Typography>
          <Button variant="outlined" color="error" startIcon={<PersonRemoveOutlinedIcon />} onClick={() => setConfirmDischarge(true)}>Discharge Patient</Button>
        </Card>
      </Stack>
    </Box>

    {assignmentDay !== null && <AssignRoutineDialog
      patientName={patient.name}
      weekday={weekdayNames[assignmentDay]}
      onCancel={() => setAssignmentDay(null)}
      onAssign={(routine) => {
        assignRoutine(patient.id, assignmentDay, routine)
        setFeedback(`${routine.name} assigned for ${weekdayNames[assignmentDay]}.`)
        setAssignmentDay(null)
      }}
    />}
    {removalDay !== null && <RemoveRoutineDialog
      patientName={patient.name}
      weekday={weekdayNames[removalDay]}
      routineName={patientAssignments[removalDay]?.name}
      onCancel={() => setRemovalDay(null)}
      onRemove={() => {
        removeRoutine(patient.id, removalDay)
        setFeedback(`${patientAssignments[removalDay]?.name ?? 'Scheduled routine'} removed from ${weekdayNames[removalDay]}.`)
        setRemovalDay(null)
      }}
    />}
    {confirmDischarge && <DischargePatientDialog
      patientName={patient.name}
      onCancel={() => setConfirmDischarge(false)}
      onDischarge={() => {
        dischargePatient(patient.id)
        navigate('/dashboard/patients', { replace: true })
      }}
    />}
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
