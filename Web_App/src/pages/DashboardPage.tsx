import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FilterListIcon from '@mui/icons-material/FilterList'
import SearchIcon from '@mui/icons-material/Search'
import SortIcon from '@mui/icons-material/Sort'
import { Box, Button, Card, Collapse, Divider, Fade, Grow, IconButton, InputAdornment, Menu, MenuItem, OutlinedInput, Stack, Typography, useTheme } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { AssignRoutineDialog } from '../components/AssignRoutineDialog'
import type { DashboardOutletContext, DayAssignments } from '../components/DashboardLayout'
import { weekdayNames, type Patient } from '../data/mockPatients'
import type { Routine, RoutineAssignmentStatus } from '../types'
import { formatCalendarDate, toLocalDateKey } from '../lib/week'

const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
type SortOrder = 'nameAsc' | 'nameDesc'
type StatusFilter = 'all' | RoutineAssignmentStatus | 'unassigned'

interface PatientRowProps {
  patient: Patient
  expanded: boolean
  onToggle: () => void
  assignments: DayAssignments
  weekDates: string[]
  onAssign: (dayIndex: number) => void
}

function PatientRow({ patient, expanded, onToggle, assignments, weekDates, onAssign }: PatientRowProps) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const border = theme.palette.divider
  const surface = theme.palette.background.paper
  const text = theme.palette.text.primary
  const accentText = '#102b34'
  const assignableSurface = isDark ? '#29454d' : '#d9d9d9'
  const neutralSurface = isDark ? '#526970' : '#777777'

  return <Card sx={{ bgcolor: 'transparent', boxShadow: 'none', border: 0, overflow: 'visible', mb: 1.5 }}>
    <Stack direction="row" alignItems="center" sx={{ position: 'relative', zIndex: 1, bgcolor: '#91c8c0', border: `4px solid ${border}`, borderRadius: '10px' }}>
      <Button component={RouterLink} to={`/dashboard/patients/${encodeURIComponent(patient.id)}`} sx={{ flex: 1, minWidth: 0, minHeight: 64, color: accentText, fontSize: { xs: '1.2rem', sm: '1.65rem' }, overflowWrap: 'anywhere', '&:hover': { bgcolor: '#82bdb5', textDecoration: 'underline' } }}>
        {patient.name}
      </Button>
      <IconButton onClick={onToggle} aria-label={`${expanded ? 'Collapse' : 'Expand'} weekly routines for ${patient.name}`} aria-expanded={expanded} aria-controls={`patient-week-${patient.id}`} sx={{ color: accentText, width: 44, height: 44, mr: 1, '&.Mui-focusVisible': { outline: '3px solid #eb681d', outlineOffset: 2 } }}>
        <ExpandMoreIcon sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 220ms ease' }} />
      </IconButton>
    </Stack>
    <Collapse id={`patient-week-${patient.id}`} in={expanded} timeout={260}>
      <Box sx={{ bgcolor: '#4b9da9', border: `4px solid ${border}`, borderTop: 0, borderRadius: '0 0 28px 28px', mt: -2, pt: 3, px: { xs: .5, sm: 1 }, pb: 1 }}>
      <Box sx={{ overflowX: 'auto' }}>
        <Stack direction="row" spacing={{ xs: .25, sm: .75 }} justifyContent="center" sx={{ minWidth: 616 }}>
          {days.map((day, index) => {
            const dayAssignments = assignments[weekDates[index]] ?? []

            return <Box key={weekDates[index]} sx={{ flex: 1, minWidth: 0, textAlign: 'center', display: 'flex', flexDirection: 'column' }}>
              <Typography sx={{ bgcolor: weekDates[index] === toLocalDateKey(new Date()) ? '#eb681d' : neutralSurface, color: 'white', border: `3px solid ${border}`, borderRadius: '28px', py: { xs: 1, sm: 1.5 }, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 700, fontSize: { xs: '.65rem', sm: '1.05rem' } }}>{day}<br />{formatCalendarDate(weekDates[index])}</Typography>
              <Stack sx={{ mt: .5, bgcolor: dayAssignments.length ? surface : assignableSurface, border: `3px solid ${border}`, borderRadius: '24px', minHeight: { xs: 112, sm: 132 }, flexGrow: 1, p: .5 }} spacing={.5}>
                {dayAssignments.map((assignment) => <Grow in key={assignment.id} timeout={220}><Typography sx={{ width: '100%', minWidth: 0, bgcolor: '#91c8c0', color: accentText, border: `2px solid ${border}`, borderRadius: '18px', px: .5, py: .75, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: { xs: '.72rem', sm: '.82rem' }, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{assignment.routineName}</Typography></Grow>)}
                <Button onClick={() => onAssign(index)} aria-label={`Assign another routine to ${patient.name} on ${weekdayNames[index]}`} sx={{ minWidth: 0, width: '100%', flexGrow: dayAssignments.length ? 0 : 1, p: .5, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: .5, color: text, borderRadius: '18px', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: { xs: '.7rem', sm: '.8rem' }, lineHeight: 1.2, '&:hover': { bgcolor: isDark ? '#35545c' : '#c8deda' }, '&.Mui-focusVisible': { outline: `3px solid ${border}`, outlineOffset: -2 } }}>
                  <Box component="span" sx={{ width: 38, height: 38, flexShrink: 0, borderRadius: '50%', bgcolor: '#4b9da9', border: `3px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AddIcon sx={{ color: 'white', fontSize: 28 }} /></Box>
                  <Box component="span">{dayAssignments.length ? 'Add another' : <>Assign<br />Routine</>}</Box>
                </Button>
              </Stack>
            </Box>
          })}
        </Stack>
      </Box>
      </Box>
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
  const { patients, routines, assignments, weekDates, assignRoutine } = useOutletContext<DashboardOutletContext>()
  const [assignmentTarget, setAssignmentTarget] = useState<{ patient: Patient; dayIndex: number } | null>(null)
  const visiblePatients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return [...patients]
      .filter((patient) => patient.name.toLowerCase().includes(normalizedQuery))
      .filter((patient) => {
        if (statusFilter === 'all') return true
        const patientAssignments = Object.values(assignments[patient.profileId] ?? {}).flat()
        if (statusFilter === 'unassigned') return patientAssignments.length === 0
        return patientAssignments.some((assignment) => assignment.status === statusFilter)
      })
      .sort((first, second) => {
        const comparison = first.name.localeCompare(second.name)
        return sortOrder === 'nameAsc' ? comparison : -comparison
      })
  }, [assignments, patients, query, sortOrder, statusFilter])
  const allExpanded = visiblePatients.length > 0 && visiblePatients.every((patient) => expanded.includes(patient.id))
  const togglePatient = (id: string) => setExpanded((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const toggleAll = () => setExpanded(allExpanded ? [] : visiblePatients.map((patient) => patient.id))

  const confirmAssignment = async (routine: Routine) => {
    if (!assignmentTarget) return
    const { patient, dayIndex } = assignmentTarget
    await assignRoutine(patient.profileId, weekDates[dayIndex], routine.id)
    setAssignmentTarget(null)
  }

  return <>
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
          <Menu anchorEl={filterMenuAnchor} open={Boolean(filterMenuAnchor)} onClose={() => setFilterMenuAnchor(null)}><MenuItem selected={statusFilter === 'all'} onClick={() => { setStatusFilter('all'); setFilterMenuAnchor(null) }} sx={{ fontFamily: 'Georgia, serif' }}>All Patients</MenuItem><MenuItem selected={statusFilter === 'missed'} onClick={() => { setStatusFilter('missed'); setFilterMenuAnchor(null) }} sx={{ fontFamily: 'Georgia, serif' }}>Missed</MenuItem><MenuItem selected={statusFilter === 'completed'} onClick={() => { setStatusFilter('completed'); setFilterMenuAnchor(null) }} sx={{ fontFamily: 'Georgia, serif' }}>Completed</MenuItem><MenuItem selected={statusFilter === 'modified'} onClick={() => { setStatusFilter('modified'); setFilterMenuAnchor(null) }} sx={{ fontFamily: 'Georgia, serif' }}>Modified</MenuItem><MenuItem selected={statusFilter === 'scheduled'} onClick={() => { setStatusFilter('scheduled'); setFilterMenuAnchor(null) }} sx={{ fontFamily: 'Georgia, serif' }}>Scheduled</MenuItem><MenuItem selected={statusFilter === 'unassigned'} onClick={() => { setStatusFilter('unassigned'); setFilterMenuAnchor(null) }} sx={{ fontFamily: 'Georgia, serif' }}>Unassigned this week</MenuItem></Menu>
          {visiblePatients.length ? visiblePatients.map((patient) => <PatientRow key={patient.id} patient={patient} expanded={expanded.includes(patient.id)} onToggle={() => togglePatient(patient.id)} assignments={assignments[patient.profileId] ?? {}} weekDates={weekDates} onAssign={(dayIndex) => setAssignmentTarget({ patient, dayIndex })} />) : <Card sx={{ p: 5, textAlign: 'center', border: `4px solid ${border}`, bgcolor: surface, color: text }}><Typography variant="h6" fontFamily="Georgia, serif">No patients found</Typography></Card>}
        </Stack>
      </Box>
      <Box sx={{ width: { xs: '100%', lg: 250 }, display: 'flex', flexDirection: { xs: 'row', lg: 'column' }, justifyContent: 'center', gap: { xs: 2, lg: 6 }, alignItems: 'center' }}><Button component={RouterLink} to="/dashboard/patients/new" sx={{ color: 'white', display: 'flex', flexDirection: 'column', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.65rem', transition: 'transform 180ms ease', '&:hover': { bgcolor: 'transparent', transform: 'translateY(-4px)' } }}><Box className="dashboard-shortcut-orb" sx={{ width: { xs: 110, sm: 170 }, height: { xs: 110, sm: 170 }, borderRadius: '50%', bgcolor: '#4b9da9', border: '4px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 180ms ease, box-shadow 180ms ease' }}><AddIcon sx={{ color: 'white', fontSize: { xs: 70, sm: 120 } }} /></Box><Box component="span" mt={1}>New Patient</Box></Button><Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', lg: 'block' }, borderColor: 'black', borderWidth: 2 }} /><Button component={RouterLink} to="/dashboard/messages" sx={{ color: 'white', display: 'flex', flexDirection: 'column', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.65rem', transition: 'transform 180ms ease', '&:hover': { bgcolor: 'transparent', transform: 'translateY(-4px)' } }}><Box className="dashboard-shortcut-orb" sx={{ position: 'relative', width: { xs: 110, sm: 170 }, height: { xs: 110, sm: 170 }, borderRadius: '50%', bgcolor: '#4b9da9', border: '4px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 180ms ease, box-shadow 180ms ease' }}><ChatBubbleOutlineIcon sx={{ color: 'white', fontSize: { xs: 65, sm: 95 } }} /><Box sx={{ position: 'absolute', top: -2, right: -2, width: 46, height: 46, bgcolor: '#ef1640', borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia, serif', fontStyle: 'normal', fontWeight: 700 }}>3</Box></Box><Box component="span" mt={1}>Messages</Box></Button></Box>
      </Stack>
    </Fade>
    {assignmentTarget && <AssignRoutineDialog
      patientName={assignmentTarget.patient.name}
      weekday={weekdayNames[assignmentTarget.dayIndex]}
      scheduledDate={weekDates[assignmentTarget.dayIndex]}
      routines={routines}
      onCancel={() => setAssignmentTarget(null)}
      onAssign={confirmAssignment}
    />}
  </>
}
