import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { PatientWeekCalendar } from '../components/PatientWeekCalendar'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FilterListIcon from '@mui/icons-material/FilterList'
import SearchIcon from '@mui/icons-material/Search'
import SortIcon from '@mui/icons-material/Sort'
import { Box, Button, Card, Collapse, Fade, IconButton, InputAdornment, Menu, MenuItem, OutlinedInput, Stack, Typography, useTheme } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { AssignedRoutineDetails } from '../components/AssignedRoutineDetails'
import { type OccupiedDate, type SchedulingPolicy } from '../lib/scheduling'
import { PatientAvatar } from '../components/PatientAvatar'
import type { DashboardOutletContext, DayAssignments } from '../components/DashboardLayout'
import { type Patient } from '../data/mockPatients'
import { resolveRoutineStatus, routineStatusLabels, routineStatusOrder, type RoutineVisualStatus } from '../lib/routineStatus'
import { RoutineStatusLegend } from '../components/RoutineStatus'
import { PatientSetupBox } from '../components/PatientSetupBox'

type SortOrder = 'nameAsc' | 'nameDesc'
type StatusFilter = 'all' | RoutineVisualStatus | 'modified' | 'unassigned'

interface PatientRowProps {
  patient: Patient
  expanded: boolean
  onToggle: () => void
  assignments: DayAssignments
  weekDates: string[]
  onAssign: (dayIndex: number) => void
  onWeekChange: (week: string) => void
  policy: SchedulingPolicy | null
  occupied: OccupiedDate[]
  loading: boolean
  error: string
  onRetry: () => void
}

function PatientRow({ patient, expanded, onToggle, assignments, weekDates, onAssign, onWeekChange, policy, occupied, loading, error, onRetry }: PatientRowProps) {
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null)
  const detailsId = `assignment-details-${patient.profileId}`
  const selectedAssignment = Object.values(assignments).flat().find((assignment) => assignment.id === selectedAssignmentId)
  const weekStart = weekDates[0]
  useEffect(() => { setSelectedAssignmentId(null) }, [expanded, weekStart])
  const theme = useTheme()
  const border = theme.palette.divider
  const accentText = '#102b34'

  return <Card sx={{ bgcolor: 'transparent', boxShadow: 'none', border: 0, overflow: 'visible', mb: 1.5 }}>
    <Stack direction="row" alignItems="center" sx={{ position: 'relative', zIndex: 1, bgcolor: '#91c8c0', border: `4px solid ${border}`, borderRadius: '10px' }}>
      <Button component={RouterLink} to={`/dashboard/patients/${encodeURIComponent(patient.id)}`} sx={{ flex: 1, minWidth: 0, minHeight: 64, justifyContent: 'flex-start', gap: { xs: 1, sm: 1.5 }, px: { xs: 1, sm: 1.5 }, color: accentText, fontSize: { xs: '1.2rem', sm: '1.65rem' }, overflowWrap: 'anywhere', textAlign: 'left', '&:hover': { bgcolor: '#82bdb5', textDecoration: 'underline' } }}>
        <PatientAvatar name={patient.name} />
        <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{patient.name}</Box>
      </Button>
      <IconButton onClick={onToggle} aria-label={`${expanded ? 'Collapse' : 'Expand'} weekly routines for ${patient.name}`} aria-expanded={expanded} aria-controls={`patient-week-${patient.id}`} sx={{ color: accentText, width: 44, height: 44, mr: 1, '&.Mui-focusVisible': { outline: '3px solid #eb681d', outlineOffset: 2 } }}>
        <ExpandMoreIcon sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 220ms ease' }} />
      </IconButton>
    </Stack>
    <Collapse id={`patient-week-${patient.id}`} in={expanded} timeout={260}>
      <Box sx={{ minWidth: 0, pt: 1 }}>
      <PatientWeekCalendar patient={patient} assignments={assignments} weekDates={weekDates} policy={policy}
        occupied={occupied} loading={loading} selectedAssignmentId={selectedAssignmentId} detailsId={detailsId}
        onSelect={(id) => setSelectedAssignmentId((current) => current === id ? null : id)} onAssign={onAssign} onWeekChange={onWeekChange} />
      </Box>
      {expanded && selectedAssignmentId && <AssignedRoutineDetails id={detailsId} assignment={selectedAssignment}
        today={policy?.today} loading={loading} error={error} onRetry={onRetry} onClose={() => setSelectedAssignmentId(null)} />}
      {expanded && <RoutineStatusLegend />}
    </Collapse>
  </Card>
}

export function DashboardPage() {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const surface = theme.palette.background.paper
  const text = theme.palette.text.primary
  const border = theme.palette.divider
  const [expanded, setExpanded] = useState<string[]>(['john'])
  const [query, setQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<SortOrder>('nameAsc')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortMenuAnchor, setSortMenuAnchor] = useState<null | HTMLElement>(null)
  const [filterMenuAnchor, setFilterMenuAnchor] = useState<null | HTMLElement>(null)
  const { patients, assignments, weekDates, openSchedule, policy, occupied, setWeek, assignmentsLoading, assignmentsError, retryAssignments } = useOutletContext<DashboardOutletContext>()
  const visiblePatients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return [...patients]
      .filter((patient) => patient.name.toLowerCase().includes(normalizedQuery))
      .filter((patient) => {
        if (statusFilter === 'all') return true
        const patientAssignments = Object.values(assignments[patient.profileId] ?? {}).flat().filter((assignment) => assignment.status !== 'cancelled')
        if (statusFilter === 'unassigned') return patientAssignments.length === 0
        return patientAssignments.some((assignment) => statusFilter === 'modified'
          ? assignment.status === 'modified' && resolveRoutineStatus(assignment, policy?.today)?.status === 'neutral'
          : resolveRoutineStatus(assignment, policy?.today)?.status === statusFilter)
      })
      .sort((first, second) => {
        const comparison = first.name.localeCompare(second.name)
        return sortOrder === 'nameAsc' ? comparison : -comparison
      })
  }, [assignments, patients, query, sortOrder, statusFilter, policy?.today])
  const allExpanded = visiblePatients.length > 0 && visiblePatients.every((patient) => expanded.includes(patient.id))
  const togglePatient = (id: string) => setExpanded((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const toggleAll = () => setExpanded(allExpanded ? [] : visiblePatients.map((patient) => patient.id))

  return <>
    <Typography component="h1" variant="h4" sx={{ mb: 2 }}>Patients</Typography>
    <Fade in appear timeout={320}>
      <Stack className="dashboard-overview" direction={{ xs: 'column', lg: 'row' }} spacing={{ xs: 2, lg: 5 }} alignItems="stretch">
      <Box flexGrow={1} minWidth={0}>
        <Stack spacing={1.5} mb={3}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.5, sm: 0 }} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ width: '100%', display: { xs: 'flex', sm: 'grid' }, gridTemplateColumns: { sm: 'auto minmax(0, 1fr) auto' }, columnGap: { sm: 1.5 }, rowGap: 1.5 }}>
            <Button onClick={toggleAll} sx={{ flexShrink: 0, bgcolor: surface, color: text, border: `4px solid ${border}`, borderRadius: '34px', px: 3, py: 1.25, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.2rem', transition: 'transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease', '&:hover': { bgcolor: isDark ? '#29454d' : '#f5f5f5', transform: 'translateY(-2px)', boxShadow: '0 6px 0 rgba(0, 0, 0, 0.14)' }, '&:active': { transform: 'translateY(0)' } }}>{allExpanded ? 'Collapse All' : 'Expand All'}</Button>
            <OutlinedInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." aria-label="Search patients" startAdornment={<InputAdornment position="start"><SearchIcon sx={{ bgcolor: '#4b9da9', border: `3px solid ${border}`, borderRadius: '50%', p: .5, boxSizing: 'content-box', fontSize: 42 }} /></InputAdornment>} sx={{ flexGrow: 1, minWidth: 0, bgcolor: surface, border: `4px solid ${border}`, borderRadius: '34px', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.3rem', '& fieldset': { border: 0 } }} />
            <Stack direction="row" spacing={1.5} sx={{ flexGrow: { sm: 1 }, justifyContent: { sm: 'flex-end' }, alignSelf: { xs: 'flex-end', sm: 'center' } }}>
              <Button startIcon={<SortIcon />} onClick={(event) => setSortMenuAnchor(event.currentTarget)} sx={{ bgcolor: surface, color: text, border: `4px solid ${border}`, borderRadius: '34px', px: 3, py: 1.25, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.2rem', transition: 'transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease', '&:hover': { bgcolor: isDark ? '#29454d' : '#f5f5f5', transform: 'translateY(-2px)', boxShadow: '0 6px 0 rgba(0, 0, 0, 0.14)' }, '&:active': { transform: 'translateY(0)' } }}>Sort by</Button>
              <Button startIcon={<FilterListIcon />} onClick={(event) => setFilterMenuAnchor(event.currentTarget)} sx={{ bgcolor: statusFilter === 'all' ? surface : '#eb681d', color: statusFilter === 'all' ? text : 'white', border: `4px solid ${border}`, borderRadius: '34px', px: 3, py: 1.25, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.2rem', transition: 'transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease', '&:hover': { bgcolor: statusFilter === 'all' ? (isDark ? '#29454d' : '#f5f5f5') : '#d15a17', transform: 'translateY(-2px)', boxShadow: '0 6px 0 rgba(0, 0, 0, 0.14)' }, '&:active': { transform: 'translateY(0)' } }}>Filter</Button>
            </Stack>
          </Stack>
          <Menu anchorEl={sortMenuAnchor} open={Boolean(sortMenuAnchor)} onClose={() => setSortMenuAnchor(null)}><MenuItem selected={sortOrder === 'nameAsc'} onClick={() => { setSortOrder('nameAsc'); setSortMenuAnchor(null) }} sx={{ fontFamily: 'Georgia, serif' }}>Name A-Z</MenuItem><MenuItem selected={sortOrder === 'nameDesc'} onClick={() => { setSortOrder('nameDesc'); setSortMenuAnchor(null) }} sx={{ fontFamily: 'Georgia, serif' }}>Name Z-A</MenuItem></Menu>
          <Menu anchorEl={filterMenuAnchor} open={Boolean(filterMenuAnchor)} onClose={() => setFilterMenuAnchor(null)}>
            {([['all', 'All Patients'], ...routineStatusOrder.map((status) => [status, routineStatusLabels[status]]), ['modified', 'Modified'], ['unassigned', 'Unassigned this week']] as [StatusFilter, string][]).map(([value, label]) =>
              <MenuItem key={value} selected={statusFilter === value} onClick={() => { setStatusFilter(value); setFilterMenuAnchor(null) }} sx={{ fontFamily: 'Georgia, serif' }}>{label}</MenuItem>)}
          </Menu>
          {visiblePatients.length ? visiblePatients.map((patient) => <PatientRow key={patient.profileId} patient={patient} expanded={expanded.includes(patient.id)} onToggle={() => togglePatient(patient.id)} assignments={assignments[patient.profileId] ?? {}} weekDates={weekDates} policy={policy} occupied={occupied[patient.profileId] ?? []} loading={assignmentsLoading} error={assignmentsError} onRetry={retryAssignments} onAssign={(dayIndex) => openSchedule(patient, weekDates[dayIndex])} onWeekChange={setWeek} />) : <Card sx={{ p: 5, textAlign: 'center', border: `4px solid ${border}`, bgcolor: surface, color: text }}><Typography variant="h6" fontFamily="Georgia, serif">No patients found</Typography></Card>}
        </Stack>
      </Box>
      <PatientSetupBox />
      </Stack>
    </Fade>
  </>
}
