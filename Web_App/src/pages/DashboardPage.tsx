import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { PatientWeekCalendar } from '../components/PatientWeekCalendar'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FilterListIcon from '@mui/icons-material/FilterList'
import SearchIcon from '@mui/icons-material/Search'
import SortIcon from '@mui/icons-material/Sort'
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined'
import { Alert, Box, Button, ButtonBase, Card, Collapse, Fade, InputAdornment, Link, Menu, MenuItem, OutlinedInput, Stack, Typography, useTheme } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { AssignedRoutineDetails } from '../components/AssignedRoutineDetails'
import { type OccupiedDate, type SchedulingPolicy } from '../lib/scheduling'
import { PatientAvatar } from '../components/PatientAvatar'
import type { DashboardOutletContext, DayAssignments } from '../components/DashboardLayout'
import { type Patient } from '../data/mockPatients'
import { resolveRoutineStatus, routineStatusLabels, routineStatusOrder, type RoutineVisualStatus } from '../lib/routineStatus'
import { RoutineStatusLegend } from '../components/RoutineStatus'
import { PatientSetupBox } from '../components/PatientSetupBox'

type SortOrder = 'nameAsc' | 'nameDesc' | 'careNewest' | 'careOldest'
const sortOptions: { value: SortOrder; label: string }[] = [
  { value: 'nameAsc', label: 'Name A–Z' },
  { value: 'nameDesc', label: 'Name Z–A' },
  { value: 'careNewest', label: 'Start of care: newest' },
  { value: 'careOldest', label: 'Start of care: oldest' },
]
function comparePatients(first: Patient, second: Patient, order: SortOrder) {
  const byName = first.name.localeCompare(second.name) || first.profileId.localeCompare(second.profileId)
  if (order === 'nameAsc') return byName
  if (order === 'nameDesc') return -byName
  if (!first.startOfCare) return second.startOfCare ? 1 : byName
  if (!second.startOfCare) return -1
  const byDate = first.startOfCare.localeCompare(second.startOfCare)
  return (order === 'careNewest' ? -byDate : byDate) || byName
}
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
      {/* Sibling controls keep the name link independent of the full-row toggle. */}
      <ButtonBase onClick={onToggle} aria-label={`${expanded ? 'Collapse' : 'Expand'} weekly routines for ${patient.name}`} aria-expanded={expanded} aria-controls={`patient-week-${patient.id}`} sx={{ position: 'absolute', inset: 0, borderRadius: 'inherit', color: accentText, justifyContent: 'flex-end', pr: 2, '&.Mui-focusVisible': { outline: '3px solid #eb681d', outlineOffset: 2 } }}>
        <ExpandMoreIcon sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 220ms ease' }} />
      </ButtonBase>
      <Stack direction="row" alignItems="center" sx={{ position: 'relative', pointerEvents: 'none', flex: 1, minWidth: 0, minHeight: 64, gap: { xs: 1, sm: 1.5 }, pl: { xs: 1, sm: 1.5 }, pr: 7, py: .75, color: accentText }}>
        <PatientAvatar name={patient.name} />
        <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          <Link component={RouterLink} to={`/dashboard/patients/${encodeURIComponent(patient.id)}`} underline="hover" sx={{ pointerEvents: 'auto', color: 'inherit', fontWeight: 700, fontSize: { xs: '1.2rem', sm: '1.65rem' }, borderRadius: '4px', '&:hover': { bgcolor: '#82bdb5' }, '&:focus-visible': { outline: '3px solid #eb681d', outlineOffset: 2, textDecoration: 'underline' } }}>{patient.name}</Link>
          {patient.dischargedAt && <Typography component="span" variant="body2" sx={{ display: 'block' }}>Discharged {new Date(patient.dischargedAt).toLocaleDateString()}{patient.retentionEndsAt && <> · Deletes {new Date(patient.retentionEndsAt).toLocaleDateString()}</>}</Typography>}
        </Box>
      </Stack>
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
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [sortMenuAnchor, setSortMenuAnchor] = useState<null | HTMLElement>(null)
  const [filterMenuAnchor, setFilterMenuAnchor] = useState<null | HTMLElement>(null)
  const { patients, assignments, weekDates, openSchedule, policy, occupied, setWeek, assignmentsLoading, assignmentsError, retryAssignments } = useOutletContext<DashboardOutletContext>()
  const visiblePatients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return [...patients]
      .filter((patient) => patient.name.toLowerCase().includes(normalizedQuery))
      .filter((patient) => {
        if (Boolean(patient.dischargedAt) !== archiveOpen) return false
        if (archiveOpen) return true
        if (statusFilter === 'all') return true
        const patientAssignments = Object.values(assignments[patient.profileId] ?? {}).flat().filter((assignment) => assignment.status !== 'cancelled')
        if (statusFilter === 'unassigned') return patientAssignments.length === 0
        return patientAssignments.some((assignment) => statusFilter === 'modified'
          ? assignment.status === 'modified' && resolveRoutineStatus(assignment, policy?.today)?.status === 'neutral'
          : resolveRoutineStatus(assignment, policy?.today)?.status === statusFilter)
      })
      .sort((first, second) => comparePatients(first, second, sortOrder))
  }, [assignments, patients, query, sortOrder, statusFilter, policy?.today, archiveOpen])
  const allExpanded = visiblePatients.length > 0 && visiblePatients.every((patient) => expanded.includes(patient.id))
  const togglePatient = (id: string) => setExpanded((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const toggleAll = () => setExpanded(allExpanded ? [] : visiblePatients.map((patient) => patient.id))

  return <>
    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 2 }}>
      <Typography component="h1" variant="h4" sx={{ minWidth: 0 }}>{archiveOpen ? 'Archived patients' : 'Patients'}</Typography>
      <Button variant={archiveOpen ? 'contained' : 'outlined'} startIcon={<ArchiveOutlinedIcon />} aria-pressed={archiveOpen} onClick={() => { setArchiveOpen(open => !open); setQuery(''); setStatusFilter('all') }} sx={{ flexShrink: 0 }}>
        Archive
      </Button>
    </Stack>
    <Fade in appear timeout={320}>
      <Stack className="dashboard-overview" direction={{ xs: 'column', lg: 'row' }} spacing={{ xs: 2, lg: 5 }} alignItems="stretch">
      <Box flexGrow={1} minWidth={0}>
        <Stack spacing={1.5} mb={3}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.5, sm: 0 }} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ width: '100%', display: { xs: 'flex', sm: 'grid' }, gridTemplateColumns: { sm: 'auto minmax(0, 1fr) auto' }, columnGap: { sm: 1.5 }, rowGap: 1.5 }}>
            <Button onClick={toggleAll} sx={{ flexShrink: 0, bgcolor: surface, color: text, border: `4px solid ${border}`, borderRadius: '34px', px: 3, py: 1.25, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.2rem', transition: 'transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease', '&:hover': { bgcolor: isDark ? '#29454d' : '#f5f5f5', transform: 'translateY(-2px)', boxShadow: '0 6px 0 rgba(0, 0, 0, 0.14)' }, '&:active': { transform: 'translateY(0)' } }}>{allExpanded ? 'Collapse All' : 'Expand All'}</Button>
            <OutlinedInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." aria-label="Search patients" startAdornment={<InputAdornment position="start"><SearchIcon sx={{ bgcolor: '#4b9da9', border: `3px solid ${border}`, borderRadius: '50%', p: .5, boxSizing: 'content-box', fontSize: 42 }} /></InputAdornment>} sx={{ flexGrow: 1, minWidth: 0, bgcolor: surface, border: `4px solid ${border}`, borderRadius: '34px', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.3rem', '& fieldset': { border: 0 } }} />
            <Stack direction="row" spacing={1.5} sx={{ flexGrow: { sm: 1 }, justifyContent: { sm: 'flex-end' }, alignSelf: { xs: 'flex-end', sm: 'center' } }}>
              <Button startIcon={<SortIcon />} onClick={(event) => setSortMenuAnchor(event.currentTarget)} aria-label={`Sort patients: ${sortOptions.find(option => option.value === sortOrder)!.label}`} sx={{ bgcolor: surface, color: text, border: `4px solid ${border}`, borderRadius: '34px', px: 3, py: 1.25, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.2rem', transition: 'transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease', '&:hover': { bgcolor: isDark ? '#29454d' : '#f5f5f5', transform: 'translateY(-2px)', boxShadow: '0 6px 0 rgba(0, 0, 0, 0.14)' }, '&:active': { transform: 'translateY(0)' } }}>Sort by</Button>
              <Button disabled={archiveOpen} startIcon={<FilterListIcon />} onClick={(event) => setFilterMenuAnchor(event.currentTarget)} sx={{ bgcolor: statusFilter === 'all' ? surface : '#eb681d', color: statusFilter === 'all' ? text : 'white', border: `4px solid ${border}`, borderRadius: '34px', px: 3, py: 1.25, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.2rem', transition: 'transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease', '&:hover': { bgcolor: statusFilter === 'all' ? (isDark ? '#29454d' : '#f5f5f5') : '#d15a17', transform: 'translateY(-2px)', boxShadow: '0 6px 0 rgba(0, 0, 0, 0.14)' }, '&:active': { transform: 'translateY(0)' } }}>Filter</Button>
            </Stack>
          </Stack>
          <Menu anchorEl={sortMenuAnchor} open={Boolean(sortMenuAnchor)} onClose={() => setSortMenuAnchor(null)}>{sortOptions.map(option => <MenuItem key={option.value} selected={sortOrder === option.value} onClick={() => { setSortOrder(option.value); setSortMenuAnchor(null) }} sx={{ fontFamily: 'Georgia, serif' }}>{option.label}</MenuItem>)}</Menu>
          <Menu anchorEl={filterMenuAnchor} open={Boolean(filterMenuAnchor)} onClose={() => setFilterMenuAnchor(null)}>
            {([['all', 'All Current Patients'], ...routineStatusOrder.map((status) => [status, routineStatusLabels[status]]), ['modified', 'Modified'], ['unassigned', 'Unassigned this week']] as [StatusFilter, string][]).map(([value, label]) =>
              <MenuItem key={value} selected={statusFilter === value} onClick={() => { setStatusFilter(value); setFilterMenuAnchor(null) }} sx={{ fontFamily: 'Georgia, serif' }}>{label}</MenuItem>)}
          </Menu>
          {archiveOpen && <Alert severity="info" action={<Button color="inherit" onClick={() => { setArchiveOpen(false); setQuery('') }}>Back to patients</Button>}>Open a profile to review history for a discharged patient.</Alert>}
          {visiblePatients.length ? visiblePatients.map((patient) => <PatientRow key={patient.profileId} patient={patient} expanded={expanded.includes(patient.id)} onToggle={() => togglePatient(patient.id)} assignments={assignments[patient.profileId] ?? {}} weekDates={weekDates} policy={policy} occupied={occupied[patient.profileId] ?? []} loading={assignmentsLoading} error={assignmentsError} onRetry={retryAssignments} onAssign={(dayIndex) => openSchedule(patient, weekDates[dayIndex])} onWeekChange={setWeek} />) : <Card sx={{ p: 5, textAlign: 'center', border: `4px solid ${border}`, bgcolor: surface, color: text }}><Typography variant="h6" fontFamily="Georgia, serif">No patients found</Typography></Card>}
        </Stack>
      </Box>
      <PatientSetupBox />
      </Stack>
    </Fade>
  </>
}
