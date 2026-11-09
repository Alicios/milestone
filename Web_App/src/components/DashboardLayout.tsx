import { useEffect, useRef, useState } from 'react'
import { Alert, AppBar, Avatar, Box, Button, Container, Divider, IconButton, Menu, MenuItem, Stack, Toolbar, Typography, useMediaQuery } from '@mui/material'
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined'
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined'
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import type { Patient } from '../data/mockPatients'
import type { Routine, RoutineAssignment, RoutineExerciseInput } from '../types'
import type { DemoRoutine } from '../lib/routinePrototype'
import {
  cancelRoutineAssignment as cancelAssignmentInDatabase,
  cancelRoutineFollowUp as cancelFollowUpInDatabase,
  completeRoutineFollowUp as completeFollowUpInDatabase,
  dischargePatient as dischargePatientFromDatabase,
  reinstatePatient as reinstatePatientInDatabase,
  deleteRoutine as deleteRoutineInDatabase,
  updatePatientDetails as updatePatientDetailsInDatabase,
  type PatientDetailsInput,
  loadPatients,
  loadRoutines,
  saveRoutine as saveRoutineInDatabase,
  saveRoutineDocument,
  scheduleRoutineFollowUp as scheduleFollowUpInDatabase,
} from '../lib/supabaseData'
import { AppError, errorMessage } from '../lib/errors'
import { useAssignmentCalendar } from '../hooks/useAssignmentCalendar'
import { useScheduleOperations } from '../hooks/useScheduleOperations'
import { SingleFlight } from '../lib/scheduleRecovery'
import { withinHorizon, type OccupiedDate, type SchedulingPolicy } from '../lib/scheduling'
import { ScheduleRoutineDialog } from './ScheduleRoutineDialog'

export type DayAssignments = Record<string, RoutineAssignment[]>
type RoutineAssignments = Record<string, DayAssignments>

export interface DashboardOutletContext {
  patients: Patient[]
  patientsLoading: boolean
  patientsError: string
  retryPatients: () => void
  routines: Routine[]
  assignments: RoutineAssignments
  weekDates: string[]
  calendarDates: string[]
  calendarMonth: string | null
  setCalendarMonth: (month: string | null) => void
  openSchedule: (patient: Patient, singleDate?: string) => void
  policy: SchedulingPolicy | null
  occupied: Record<string, OccupiedDate[]>
  setWeek: (week: string) => void
  assignmentsLoading: boolean
  assignmentsError: string
  retryAssignments: () => void
  cancelAssignment: (assignmentId: string) => Promise<void>
  scheduleFollowUp: (assignmentId: string, scheduledAt: string) => Promise<void>
  cancelFollowUp: (assignmentId: string) => Promise<void>
  completeFollowUp: (assignmentId: string) => Promise<void>
  saveRoutine: (routineId: string | null, name: string, exercises: RoutineExerciseInput[], impactToken?: string) => Promise<void>
  deleteRoutine: (routineId: string, impactToken?: string) => Promise<void>
  saveEditorRoutine: (routineId: string | null, document: DemoRoutine, impactToken?: string) => Promise<string>
  updatePatientDetails: (patientId: string, input: PatientDetailsInput) => Promise<void>
  dischargePatient: (patientId: string) => Promise<void>
  reinstatePatient: (patientId: string) => Promise<void>
}

const teal = '#4b9da9'
const aqua = '#91c8c0'

export function DashboardLayout() {
  const { user } = useAuth()
  // Provider-specific state is discarded synchronously on an account change.
  return <DashboardWorkspace key={user?.id ?? 'signed-out'} />
}

export function DashboardWorkspace() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const mobileDock = useMediaQuery('(max-width:599.95px)')
  const isPatientDetailPage = /^\/dashboard\/patients\/[^/]+$/.test(location.pathname) && !location.pathname.endsWith('/new')
  const isMessagesPage = location.pathname === '/dashboard/messages'
  const isPatientsPage = location.pathname === '/dashboard' || location.pathname.startsWith('/dashboard/patients')
  const [profileMenuAnchor, setProfileMenuAnchor] = useState<null | HTMLElement>(null)
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientsLoading, setPatientsLoading] = useState(true)
  const [patientsError, setPatientsError] = useState('')
  const [patientAttempt, setPatientAttempt] = useState(0)
  const retryPatients = () => setPatientAttempt((attempt) => attempt + 1)
  const [routines, setRoutines] = useState<Routine[]>([])
  const [routineReloadError, setRoutineReloadError] = useState('')
  const [routinesReloading, setRoutinesReloading] = useState(false)
  const routineReloadPending = useRef(false)
  const activeProvider = useRef(user?.id)
  activeProvider.current = user?.id
  useEffect(() => {
    activeProvider.current = user?.id
    return () => { activeProvider.current = undefined }
  }, [user?.id])
  const reloadRoutines = async () => {
    if (!user || routineReloadPending.current) return
    routineReloadPending.current = true
    setRoutinesReloading(true)
    try {
      const rows = await loadRoutines(user.id)
      if (activeProvider.current !== user.id) return
      setRoutines(rows)
      setRoutineReloadError('')
    } catch (error) {
      if (activeProvider.current !== user.id) return
      setRoutineReloadError((current) => current.startsWith('Routine saved successfully')
        ? 'Routine saved successfully, but routines still could not be reloaded. Retry loading routines.'
        : errorMessage(error, 'Routines could not be loaded.'))
    } finally {
      routineReloadPending.current = false
      if (activeProvider.current === user.id) setRoutinesReloading(false)
    }
  }
  const calendar = useAssignmentCalendar(user?.id, patients.map((patient) => patient.profileId))
  const { assignments, weekDates, calendarDates, calendarMonth, setCalendarMonth, policy, occupied, setWeek } = calendar
  const retryAssignments = () => { void calendar.refreshPolicy(); void calendar.refresh().catch(() => {}) }
  const [assignmentNotice, setAssignmentNotice] = useState('')
  const [target, setTarget] = useState<{ patient: Patient; singleDate?: string } | null>(null)
  const mutations = useRef(new SingleFlight())
  const refreshAfterSave = async () => {
    if (!user || activeProvider.current !== user.id) return
    calendar.invalidate()
    setAssignmentNotice('')
    try { await calendar.refresh() }
    catch { setAssignmentNotice('Changes saved successfully, but assignments could not be reloaded. Retry loading assignments; do not repeat the save.') }
    // No prescription or patient data is broadcast to other tabs.
    try { window.localStorage.setItem('milestone.schedule.changed', crypto.randomUUID()) } catch { /* focus/poll also refresh */ }
  }
  const operations = useScheduleOperations(user?.id, refreshAfterSave)
  const afterSave = useRef(refreshAfterSave)
  afterSave.current = refreshAfterSave
  const refreshCalendar = useRef(calendar.refresh)
  refreshCalendar.current = calendar.refresh
  const openSchedule = (patient: Patient, singleDate?: string) => {
    if (patient.dischargedAt || !policy || !weekDates.length || (singleDate && !withinHorizon(singleDate, policy))) return
    setTarget({ patient, singleDate })
  }

  useEffect(() => {
    let active = true
    if (!user) return () => { active = false }
    setPatientsLoading(true)
    setPatientsError('')
    void loadPatients(user.id).then((nextPatients) => {
      if (!active) return
      setPatients(nextPatients)
    }).catch((error: Error) => {
      if (active) setPatientsError(errorMessage(error, 'Patients could not be loaded.'))
    }).finally(() => {
      if (active) setPatientsLoading(false)
    })
    return () => { active = false }
  }, [user?.id, patientAttempt, location.key])

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') retryPatients() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  useEffect(() => {
    let active = true
    setRoutines([])
    setRoutineReloadError('')
    if (user) {
      void loadRoutines(user.id).then((rows) => {
        if (active) setRoutines(rows)
      }).catch((error) => {
        if (active) setRoutineReloadError(errorMessage(error, 'Routines could not be loaded.'))
      })
    }
    return () => { active = false }
  }, [user])

  const cancelAssignment = (assignmentId: string) => mutations.current.run(`cancel:${assignmentId}`, async () => {
    const provider = user?.id
    calendar.invalidate()
    try { await cancelAssignmentInDatabase(assignmentId) }
    catch (error) {
      if (activeProvider.current === provider) void refreshCalendar.current().catch(() => {})
      throw error
    }
    if (activeProvider.current === provider) await afterSave.current()
  })

  const scheduleFollowUp = async (assignmentId: string, scheduledAt: string) => {
    await scheduleFollowUpInDatabase(assignmentId, scheduledAt)
    await afterSave.current()
  }

  const cancelFollowUp = async (assignmentId: string) => {
    await cancelFollowUpInDatabase(assignmentId)
    await afterSave.current()
  }

  const completeFollowUp = async (assignmentId: string) => {
    await completeFollowUpInDatabase(assignmentId)
    await afterSave.current()
  }

  const saveRoutine = async (routineId: string | null, name: string, exercises: RoutineExerciseInput[], impactToken?: string) => {
    if (!user) throw new AppError('AUTH_REQUIRED')
    await saveRoutineInDatabase(routineId, name, exercises, impactToken)
    if (routineId && activeProvider.current === user.id) calendar.invalidate()
    try {
      const rows = await loadRoutines(user.id)
      if (activeProvider.current !== user.id) return
      setRoutines(rows)
      setRoutineReloadError('')
    } catch {
      if (activeProvider.current !== user.id) return
      // The database write succeeded. Retrying must reload, never repeat creation.
      setRoutineReloadError('Routine saved successfully, but routines could not be reloaded. Retry loading routines to make it available for assignment.')
    }
  }

  const deleteRoutine = async (routineId: string, impactToken?: string) => {
    if (!user) throw new AppError('AUTH_REQUIRED')
    await deleteRoutineInDatabase(routineId, impactToken)
    if (activeProvider.current !== user.id) return
    setRoutines((current) => current.filter((routine) => routine.id !== routineId))
    calendar.invalidate()
  }

  const saveEditorRoutine = async (routineId: string | null, document: DemoRoutine, impactToken?: string) => {
    if (!user) throw new AppError('AUTH_REQUIRED')
    const savedId = await saveRoutineDocument(routineId, document, impactToken)
    if (activeProvider.current !== user.id) return savedId
    calendar.invalidate()
    try {
      const rows = await loadRoutines(user.id)
      if (activeProvider.current === user.id) { setRoutines(rows); setRoutineReloadError('') }
    } catch {
      setRoutineReloadError('Routine saved successfully, but routines could not be reloaded. Retry loading routines to make it available for assignment.')
    }
    return savedId
  }

  const updatePatientDetails = (patientId: string, input: PatientDetailsInput) => mutations.current.run(`patient:${patientId}`, async () => {
    const providerId = user?.id
    if (!providerId) throw new AppError('AUTH_REQUIRED')
    const saved = await updatePatientDetailsInDatabase(patientId, input)
    if (activeProvider.current !== providerId) return
    setPatients(current => current.map(patient => patient.id !== saved.id ? patient : {
      ...patient, name: saved.name, email: saved.email ?? undefined, phone: saved.phone ?? undefined,
      primaryConcern: saved.primary_concern ?? undefined, treatmentFocus: saved.treatment_focus ?? undefined,
      startOfCare: saved.start_of_care ?? undefined, careStatus: saved.care_status ?? patient.careStatus,
    }))
  })

  const dischargePatient = async (patientId: string) => {
    await dischargePatientFromDatabase(patientId)
    if (activeProvider.current !== user?.id) return
    retryPatients()
    calendar.invalidate()
  }

  const reinstatePatient = (patientId: string) => mutations.current.run(`reinstate:${patientId}`, async () => {
    const providerId = user?.id
    if (!providerId) throw new AppError('AUTH_REQUIRED')
    await reinstatePatientInDatabase(patientId)
    if (activeProvider.current !== providerId) return
    setPatients(current => current.map(patient => patient.id === patientId
      ? { ...patient, dischargedAt: undefined, retentionEndsAt: undefined } : patient))
    retryPatients()
    calendar.invalidate()
  })

  const navItems = [
    { label: 'Patients', to: '/dashboard/patients', active: isPatientsPage, icon: <PeopleAltOutlinedIcon /> },
    { label: 'Routines', to: '/dashboard/routines', active: location.pathname === '/dashboard/routines', icon: <AssignmentOutlinedIcon /> },
    { label: 'Appointments', to: '/dashboard/appointments', active: location.pathname === '/dashboard/appointments', icon: <EventNoteOutlinedIcon /> },
    { label: 'Messages', to: '/dashboard/messages', active: isMessagesPage, icon: <ForumOutlinedIcon /> },
  ]
  const buttonSx = {
    minWidth: 0, minHeight: { xs: 42, sm: 48 }, px: { xs: .5, sm: 1.25 }, py: 0.5,
    display: 'flex', flexDirection: 'row', gap: 0, borderRadius: '14px', whiteSpace: 'nowrap',
    color: 'black', bgcolor: aqua, fontFamily: 'inherit', fontSize: { xs: '.61rem', sm: '.78rem' },
    fontWeight: 700, lineHeight: 1.15, '& .MuiButton-startIcon': { m: 0, mr: { xs: .35, sm: .75 }, '& > *:nth-of-type(1)': { fontSize: { xs: 17, sm: 21 } } },
    '&:hover': { bgcolor: '#eb681d', color: 'white' },
  }

  return <Box className={isMessagesPage ? 'dashboard-shell messages-shell' : 'dashboard-shell modern-dashboard-shell'} sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary', fontFamily: 'Georgia, Times New Roman, serif' }}>
    <AppBar className="dashboard-header" position="sticky" elevation={0} sx={{ bgcolor: teal, color: 'white', borderRadius: { xs: 0, md: '0 0 16px 16px' }, zIndex: (theme) => theme.zIndex.appBar }}>
      <Container maxWidth="xl">
        <Toolbar disableGutters sx={{ minHeight: { xs: 72, sm: 124 }, justifyContent: 'space-between', gap: { xs: .5, sm: 2 }, alignItems: 'center', flexWrap: 'nowrap', py: { xs: .5, sm: 0 }, position: 'relative' }}>
          <Stack component="nav" aria-label="Provider pages" direction="row" spacing={{ xs: .35, sm: 1 }} justifyContent="center" sx={{ flex: { xs: 1, md: 'initial' }, minWidth: 0, position: { md: 'absolute' }, left: { md: '50%' }, transform: { md: 'translateX(-50%)' }, zIndex: 1 }}>
            {navItems.map((item) => <Button key={item.to} component={RouterLink} to={item.to} aria-label={item.label} aria-current={item.active ? 'page' : undefined} startIcon={item.icon} sx={{ ...buttonSx, flex: { xs: 1, md: 'initial' }, bgcolor: item.active ? '#eb681d' : aqua, color: item.active ? 'white' : 'black' }}>
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{item.label}</Box>
              <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>{item.label === 'Appointments' ? 'Appts' : item.label}</Box>
            </Button>)}
          </Stack>
          <Stack className="dashboard-account-nav" direction="row" spacing={{ xs: .5, sm: 2 }} alignItems="center" sx={{ ml: { md: 'auto' }, flexShrink: 0 }}>
            <Typography sx={{ display: { xs: 'none', lg: 'block' }, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 700, fontSize: { sm: '1.7rem', md: '2.4rem' }, whiteSpace: 'nowrap' }}>Welcome, {user?.name.split(' ')[0]}!</Typography>
            <IconButton id="profile-menu-button" aria-label="Open profile menu" aria-haspopup="menu" aria-expanded={Boolean(profileMenuAnchor) ? 'true' : undefined} onClick={(event) => setProfileMenuAnchor(event.currentTarget)} sx={{ p: 0, borderRadius: '50%' }}>
              <Avatar alt={`${user?.name ?? 'User'} profile picture`} src={user?.avatarUrl} sx={{ width: { xs: 38, sm: 80 }, height: { xs: 38, sm: 80 }, bgcolor: aqua, color: 'black', border: '3px solid black', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: { xs: '.9rem', sm: '1.9rem' } }}>{user?.initials}</Avatar>
              <Box component="span" sx={{ display: { xs: 'block', sm: 'none' }, color: 'white', fontFamily: 'Montserrat, Arial, sans-serif', fontSize: '.625rem', lineHeight: 1.2 }}>Profile</Box>
            </IconButton>
            <Menu anchorEl={profileMenuAnchor} open={Boolean(profileMenuAnchor)} onClose={() => setProfileMenuAnchor(null)} MenuListProps={{ 'aria-labelledby': 'profile-menu-button' }} anchorOrigin={{ vertical: mobileDock ? 'top' : 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: mobileDock ? 'bottom' : 'top', horizontal: 'right' }}>
              <Box sx={{ px: 2, py: 1 }}><Typography sx={{ fontWeight: 700, fontFamily: 'Georgia, serif' }}>{user?.name}</Typography>{(user?.professionalTitle || user?.medicalPracticeName) && <Typography variant="body2" color="text.secondary">{[user.professionalTitle, user.medicalPracticeName].filter(Boolean).join(' · ')}</Typography>}<Typography variant="body2" color="text.secondary">{user?.email}</Typography></Box>
              <Divider />
              <MenuItem component={RouterLink} to="/dashboard/profile" onClick={() => setProfileMenuAnchor(null)} sx={{ fontFamily: 'Georgia, serif' }}>Profile</MenuItem>
              <MenuItem component={RouterLink} to="/dashboard/settings" onClick={() => setProfileMenuAnchor(null)} sx={{ fontFamily: 'Georgia, serif' }}>Settings</MenuItem>
              <MenuItem onClick={() => { setProfileMenuAnchor(null); void logout() }} sx={{ fontFamily: 'Georgia, serif' }}>Logout</MenuItem>
            </Menu>
          </Stack>
        </Toolbar>
      </Container>
    </AppBar>
    <Container maxWidth={false} sx={{ width: { xs: '100%', sm: '95%', md: '90%' }, maxWidth: 'none', py: isMessagesPage ? 0 : { xs: 2, md: 3 } }}>
      <Stack role="region" aria-label="Dashboard notifications" spacing={1} sx={{
        position: 'fixed', top: { xs: 16, sm: 80 }, right: { xs: 16, sm: 24 },
        width: { xs: 'calc(100% - 32px)', sm: 420 }, maxWidth: 'calc(100% - 32px)',
        maxHeight: { xs: 'calc(100dvh - var(--provider-dock-space, 72px) - 32px)', sm: 'calc(100dvh - 96px)' }, overflowY: 'auto',
        zIndex: (theme) => theme.zIndex.appBar + 1, pointerEvents: 'none',
        '& .MuiAlert-root': { pointerEvents: 'auto', boxShadow: 3, flexShrink: 0, overflowWrap: 'anywhere' },
        '& .MuiAlert-message': { minWidth: 0 },
        '& .MuiAlert-action': { alignItems: 'center' },
      }}>
        {patientsLoading && <Alert role="status" severity="info">Loading patients from Supabase…</Alert>}
        {patientsError && <Alert severity="error" action={<Button color="inherit" onClick={retryPatients}>Retry patients</Button>}>{patientsError}</Alert>}
        {calendar.error && <Alert severity="error" action={<Button color="inherit" disabled={calendar.refreshing} onClick={retryAssignments}>Retry loading assignments</Button>}>{calendar.error}</Alert>}
        {calendar.loading && !calendar.error && <Alert role="status" severity="info">Loading assignment calendar…</Alert>}
        {assignmentNotice && <Alert severity="warning" action={<Button color="inherit" disabled={calendar.refreshing} onClick={() => void calendar.refresh().then(() => setAssignmentNotice('')).catch(() => {})}>Retry loading assignments</Button>}>{assignmentNotice}</Alert>}
        {operations.storageError && <Alert severity="error">{operations.storageError}</Alert>}
        {operations.notice && <Alert role="status" severity="info">{operations.notice}</Alert>}
        {operations.pending.map((operation) => <Alert key={operation.requestId} severity="warning">
          Confirmed schedule awaiting verification for {patients.find((patient) => patient.profileId === operation.patientProfileId)?.name ?? 'a patient relationship'}: {operation.entries.map((entry) => entry.date).join(', ')}.
          <Stack direction="row" spacing={1}><Button disabled={operations.busy.includes(operation.requestId)} onClick={() => void operations.recover(operation)}>Check receipt</Button><Button disabled={operations.busy.includes(operation.requestId)} onClick={() => void operations.recover(operation, true)}>Retry same confirmed request</Button></Stack>
        </Alert>)}
        {routineReloadError && <Alert severity="warning" action={<Button color="inherit" disabled={routinesReloading} onClick={() => void reloadRoutines()}>{routinesReloading ? 'Loading…' : 'Retry loading routines'}</Button>}>{routineReloadError}</Alert>}
      </Stack>
      <Outlet context={{ patients, patientsLoading, patientsError, retryPatients, routines, assignments, weekDates, calendarDates, calendarMonth, setCalendarMonth, openSchedule, policy, occupied, setWeek, assignmentsLoading: calendar.loading, assignmentsError: calendar.error, retryAssignments, cancelAssignment, scheduleFollowUp, cancelFollowUp, completeFollowUp, saveRoutine, saveEditorRoutine, deleteRoutine, updatePatientDetails, dischargePatient, reinstatePatient } satisfies DashboardOutletContext} />
      {target && policy && <ScheduleRoutineDialog key={`${target.patient.profileId}/${target.singleDate ?? weekDates[0]}`} patientName={target.patient.name} patientProfileId={target.patient.profileId} routines={routines} weekStart={weekDates[0]} singleDate={target.singleDate} policy={policy} onCancel={() => setTarget(null)} onConfirm={async (entries) => {
        calendar.invalidate()
        try {
          const saved = await operations.confirm(target.patient.profileId, entries)
          if (!saved) void refreshCalendar.current().catch(() => {})
          return saved
        } catch (error) { void refreshCalendar.current().catch(() => {}); throw error }
      }} />}
    </Container>
  </Box>
}
