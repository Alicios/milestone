import { useEffect, useRef, useState } from 'react'
import { Alert, AppBar, Avatar, Box, Button, Container, Divider, IconButton, Menu, MenuItem, Stack, Toolbar, Typography } from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import type { Patient } from '../data/mockPatients'
import type { Routine, RoutineAssignment, RoutineExerciseInput } from '../types'
import {
  cancelRoutineAssignment as cancelAssignmentInDatabase,
  cancelRoutineFollowUp as cancelFollowUpInDatabase,
  completeRoutineFollowUp as completeFollowUpInDatabase,
  dischargePatient as dischargePatientFromDatabase,
  loadPatients,
  loadRoutines,
  saveRoutine as saveRoutineInDatabase,
  scheduleRoutineFollowUp as scheduleFollowUpInDatabase,
} from '../lib/supabaseData'
import { errorMessage } from '../lib/errors'
import { useAssignmentCalendar } from '../hooks/useAssignmentCalendar'
import { useScheduleOperations } from '../hooks/useScheduleOperations'
import { SingleFlight } from '../lib/scheduleRecovery'
import { withinHorizon, type OccupiedDate, type SchedulingPolicy } from '../lib/scheduling'
import { ScheduleRoutineDialog } from './ScheduleRoutineDialog'

export type DayAssignments = Record<string, RoutineAssignment[]>
type RoutineAssignments = Record<string, DayAssignments>

export interface DashboardOutletContext {
  patients: Patient[]
  routines: Routine[]
  assignments: RoutineAssignments
  weekDates: string[]
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
  saveRoutine: (routineId: string | null, name: string, exercises: RoutineExerciseInput[]) => Promise<void>
  dischargePatient: (patientId: string) => Promise<void>
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
  const isMessagesPage = location.pathname === '/dashboard/messages'
  const isPatientsPage = location.pathname === '/dashboard' || location.pathname.startsWith('/dashboard/patients')
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileMenuAnchor, setProfileMenuAnchor] = useState<null | HTMLElement>(null)
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientsLoading, setPatientsLoading] = useState(true)
  const [patientsError, setPatientsError] = useState('')
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
  const { assignments, weekDates, policy, occupied, setWeek } = calendar
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
    if (!policy || !weekDates.length || (singleDate && !withinHorizon(singleDate, policy))) return
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
      if (active) setPatientsError(error.message || 'Patients could not be loaded from Supabase.')
    }).finally(() => {
      if (active) setPatientsLoading(false)
    })
    return () => { active = false }
  }, [user?.id])

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

  const saveRoutine = async (routineId: string | null, name: string, exercises: RoutineExerciseInput[]) => {
    if (!user) throw new Error('Sign in before saving a routine.')
    await saveRoutineInDatabase(routineId, name, exercises)
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

  const dischargePatient = async (patientId: string) => {
    await dischargePatientFromDatabase(patientId)
    if (activeProvider.current !== user?.id) return
    setPatients((current) => current.filter((item) => item.id !== patientId))
    calendar.invalidate()
  }

  const buttonSx = { color: 'black', border: '4px solid black', borderRadius: '18px', px: { xs: 2, sm: 3 }, py: 0.75, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: { xs: '1.2rem', sm: '1.7rem' }, '&:hover': { bgcolor: '#eb681d', color: 'white' } }

  return <Box className={isMessagesPage ? 'dashboard-shell messages-shell' : 'dashboard-shell modern-dashboard-shell'} sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary', fontFamily: 'Georgia, Times New Roman, serif' }}>
    <AppBar className="dashboard-header" position="sticky" elevation={0} sx={{ bgcolor: teal, color: 'white', borderRadius: { xs: 0, md: '0 0 16px 16px' }, zIndex: (theme) => theme.zIndex.appBar }}>
      <Container maxWidth="xl">
        <Toolbar disableGutters sx={{ minHeight: { xs: 96, sm: 124 }, justifyContent: 'space-between', gap: 2, alignItems: 'center', flexWrap: { xs: 'wrap', sm: 'nowrap' }, py: { xs: .5, sm: 0 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 2 }} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <Button component={RouterLink} to="/dashboard" onClick={() => setMenuOpen(false)} aria-current={isPatientsPage ? 'page' : undefined} sx={{ ...buttonSx, bgcolor: isPatientsPage ? '#eb681d' : aqua, color: isPatientsPage ? 'white' : 'black' }}>Patients</Button>
            <Button component={RouterLink} to="/dashboard/routines" onClick={() => setMenuOpen(false)} sx={{ ...buttonSx, bgcolor: location.pathname === '/dashboard/routines' ? '#eb681d' : aqua }}>Routines</Button>
            <Button component={RouterLink} to="/dashboard/messages" onClick={() => setMenuOpen(false)} sx={{ ...buttonSx, bgcolor: location.pathname === '/dashboard/messages' ? '#eb681d' : aqua, color: location.pathname === '/dashboard/messages' ? 'white' : 'black' }}>Messages</Button>
          </Stack>
          <Stack direction="row" spacing={{ xs: 1, sm: 2 }} alignItems="center" sx={{ ml: 'auto' }}>
            <Typography sx={{ display: { xs: 'none', sm: 'block' }, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 700, fontSize: { sm: '1.7rem', md: '2.4rem' }, whiteSpace: 'nowrap' }}>Welcome, {user?.name.split(' ')[0]}!</Typography>
            <IconButton id="profile-menu-button" aria-label="Open profile menu" aria-haspopup="menu" aria-expanded={Boolean(profileMenuAnchor) ? 'true' : undefined} onClick={(event) => setProfileMenuAnchor(event.currentTarget)} sx={{ p: 0, borderRadius: '50%' }}>
              <Avatar alt={`${user?.name ?? 'User'} profile picture`} src={user?.avatarUrl} sx={{ width: { xs: 50, sm: 80 }, height: { xs: 50, sm: 80 }, bgcolor: aqua, color: 'black', border: '3px solid black', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: { xs: '1.1rem', sm: '1.9rem' } }}>{user?.initials}</Avatar>
            </IconButton>
            <Menu anchorEl={profileMenuAnchor} open={Boolean(profileMenuAnchor)} onClose={() => setProfileMenuAnchor(null)} MenuListProps={{ 'aria-labelledby': 'profile-menu-button' }} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
              <Box sx={{ px: 2, py: 1 }}><Typography sx={{ fontWeight: 700, fontFamily: 'Georgia, serif' }}>{user?.name}</Typography>{(user?.professionalTitle || user?.medicalPracticeName) && <Typography variant="body2" color="text.secondary">{[user.professionalTitle, user.medicalPracticeName].filter(Boolean).join(' · ')}</Typography>}<Typography variant="body2" color="text.secondary">{user?.email}</Typography></Box>
              <Divider />
              <MenuItem component={RouterLink} to="/dashboard/profile" onClick={() => setProfileMenuAnchor(null)} sx={{ fontFamily: 'Georgia, serif' }}>Profile</MenuItem>
              <MenuItem component={RouterLink} to="/dashboard/settings" onClick={() => setProfileMenuAnchor(null)} sx={{ fontFamily: 'Georgia, serif' }}>Settings</MenuItem>
              <MenuItem onClick={() => { setProfileMenuAnchor(null); logout() }} sx={{ fontFamily: 'Georgia, serif' }}>Logout</MenuItem>
            </Menu>
            <IconButton aria-label="Open dashboard menu" onClick={() => setMenuOpen((open) => !open)} sx={{ display: { xs: 'flex', md: 'none' }, color: 'white' }}><MenuIcon /></IconButton>
          </Stack>
        </Toolbar>
        {menuOpen && <Box sx={{ display: { xs: 'block', md: 'none' }, pb: 2 }}>
          <Button component={RouterLink} to="/dashboard/patients" sx={{ color: 'white', fontFamily: 'Georgia, serif' }}>Patients</Button>
          <Button component={RouterLink} to="/dashboard/appointments" sx={{ color: 'white', fontFamily: 'Georgia, serif' }}>Appointments</Button>
          <Button component={RouterLink} to="/dashboard/messages" sx={{ color: 'white', fontFamily: 'Georgia, serif' }}>Messages</Button>
        </Box>}
      </Container>
    </AppBar>
    <Container maxWidth={false} sx={{ width: { xs: '100%', sm: '95%', md: '90%' }, maxWidth: 'none', py: isMessagesPage ? 0 : { xs: 2, md: 3 } }}>
      {patientsLoading && <Alert severity="info" sx={{ mb: 2 }}>Loading patients from Supabase…</Alert>}
      {patientsError && <Alert severity="error" sx={{ mb: 2 }}>{patientsError}</Alert>}
      {calendar.error && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" disabled={calendar.refreshing} onClick={retryAssignments}>Retry loading assignments</Button>}>{calendar.error}</Alert>}
      {calendar.loading && !calendar.error && <Alert severity="info" sx={{ mb: 2 }}>Loading assignment calendar…</Alert>}
      {assignmentNotice && <Alert severity="warning" sx={{ mb: 2 }} action={<Button color="inherit" disabled={calendar.refreshing} onClick={() => void calendar.refresh().then(() => setAssignmentNotice('')).catch(() => {})}>Retry loading assignments</Button>}>{assignmentNotice}</Alert>}
      {operations.storageError && <Alert severity="error">{operations.storageError}</Alert>}
      {operations.notice && <Alert severity="info" sx={{ mb: 2 }}>{operations.notice}</Alert>}
      {operations.pending.map((operation) => <Alert key={operation.requestId} severity="warning" sx={{ mb: 2 }}>
        Confirmed schedule awaiting verification for {patients.find((patient) => patient.profileId === operation.patientProfileId)?.name ?? 'a patient relationship'}: {operation.entries.map((entry) => entry.date).join(', ')}.
        <Stack direction="row" spacing={1}><Button disabled={operations.busy.includes(operation.requestId)} onClick={() => void operations.recover(operation)}>Check receipt</Button><Button disabled={operations.busy.includes(operation.requestId)} onClick={() => void operations.recover(operation, true)}>Retry same confirmed request</Button></Stack>
      </Alert>)}
      {routineReloadError && <Alert severity="warning" sx={{ mb: 2 }} action={<Button color="inherit" disabled={routinesReloading} onClick={() => void reloadRoutines()}>{routinesReloading ? 'Loading…' : 'Retry loading routines'}</Button>}>{routineReloadError}</Alert>}
      <Outlet context={{ patients, routines, assignments, weekDates, openSchedule, policy, occupied, setWeek, assignmentsLoading: calendar.loading, assignmentsError: calendar.error, retryAssignments, cancelAssignment, scheduleFollowUp, cancelFollowUp, completeFollowUp, saveRoutine, dischargePatient } satisfies DashboardOutletContext} />
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
