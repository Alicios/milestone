import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FilterListIcon from '@mui/icons-material/FilterList'
import RemoveIcon from '@mui/icons-material/Remove'
import SearchIcon from '@mui/icons-material/Search'
import SortIcon from '@mui/icons-material/Sort'
import SwapVertIcon from '@mui/icons-material/SwapVert'
import { Box, Button, Card, Collapse, Divider, Fade, Grow, InputAdornment, Menu, MenuItem, OutlinedInput, Stack, Tooltip, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { AssignRoutineDialog } from '../components/AssignRoutineDialog'
import type { DashboardOutletContext, DayAssignments } from '../components/DashboardLayout'
import type { Routine } from '../data/mockRoutines'

interface Patient {
  id: string
  name: string
  statuses: Array<'missed' | 'complete' | 'modified' | 'none' | 'routine'>
}

const patients: Patient[] = [
  { id: 'john', name: 'John Patientman', statuses: ['missed', 'complete', 'modified', 'none', 'routine', 'none', 'routine'] },
  { id: 'katherine', name: 'Katherine Varela', statuses: ['complete', 'complete', 'routine', 'complete', 'none', 'none', 'routine'] },
  { id: 'neal', name: 'Neal Terrell', statuses: ['routine', 'complete', 'complete', 'none', 'routine', 'none', 'none'] },
  { id: 'frank', name: 'Frank Murgolo', statuses: ['none', 'routine', 'complete', 'complete', 'none', 'none', 'routine'] },
]

const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
type SortOrder = 'nameAsc' | 'nameDesc'
type StatusFilter = 'all' | Patient['statuses'][number]

interface PatientRowProps {
  patient: Patient
  expanded: boolean
  onToggle: () => void
  assignments: DayAssignments
  onAssign: (dayIndex: number) => void
}

function StatusIcon({ status }: { status: Patient['statuses'][number] }) {
  if (status === 'missed') return <CloseIcon />
  if (status === 'complete') return <CheckIcon />
  if (status === 'modified') return <SwapVertIcon />
  if (status === 'routine') return <Typography component="span" sx={{ fontSize: '1.5rem', lineHeight: 1 }}>✣</Typography>
  return <RemoveIcon />
}

function PatientRow({ patient, expanded, onToggle, assignments, onAssign }: PatientRowProps) {
  return <Card sx={{ bgcolor: 'transparent', boxShadow: 'none', border: 0, overflow: 'visible', mb: 1.5 }}>
    <Button fullWidth onClick={onToggle} aria-expanded={expanded} sx={{ minHeight: 64, justifyContent: 'center', position: 'relative', bgcolor: '#91c8c0', color: 'black', border: '4px solid black', borderRadius: '40px', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: { xs: '1.2rem', sm: '1.65rem' }, transition: 'transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease', '&:hover': { bgcolor: '#82bdb5', transform: 'translateY(-2px)', boxShadow: '0 8px 0 rgba(0, 0, 0, 0.18)' }, '&:active': { transform: 'translateY(0)' }, '&.Mui-focusVisible': { outline: '3px solid #eb681d', outlineOffset: 3 } }}>
      {patient.name}<ExpandMoreIcon sx={{ position: 'absolute', right: 12, bgcolor: 'black', color: '#91c8c0', borderRadius: '50%', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 220ms ease' }} />
    </Button>
    <Collapse in={expanded} timeout={260} unmountOnExit>
      <Box sx={{ bgcolor: '#4b9da9', border: '4px solid black', borderTop: 0, borderRadius: '0 0 28px 28px', mt: -2, pt: 3, px: { xs: .5, sm: 1 }, pb: 1 }}>
      <Box sx={{ overflowX: 'auto' }}>
        <Stack direction="row" spacing={{ xs: .25, sm: .75 }} justifyContent="center" sx={{ minWidth: 616 }}>
          {days.map((day, index) => {
            const routine = assignments[index]
            const status = patient.statuses[index]
            const isAssignable = status === 'none' && !routine

            return <Box key={day} sx={{ flex: 1, minWidth: 0, textAlign: 'center', display: 'flex', flexDirection: 'column' }}>
              <Typography sx={{ bgcolor: index === 2 ? '#eb681d' : '#777777', color: 'white', border: '3px solid black', borderRadius: '28px', py: { xs: 1, sm: 1.5 }, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 700, fontSize: { xs: '.65rem', sm: '1.15rem' } }}>{day}</Typography>
              <Box sx={{ mt: .5, bgcolor: isAssignable ? '#d9d9d9' : 'white', border: '3px solid black', borderRadius: '24px', minHeight: { xs: 112, sm: 132 }, flexGrow: 1, display: 'flex', alignItems: routine ? 'flex-start' : 'center', justifyContent: 'center', p: .5 }}>
                {routine ? <Grow in key={routine.id} timeout={220}><Typography sx={{ width: '100%', minWidth: 0, bgcolor: '#91c8c0', color: 'black', border: '2px solid black', borderRadius: '18px', px: .5, py: .75, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: { xs: '.8rem', sm: '.9rem' }, lineHeight: 1.3, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{routine.name}</Typography></Grow>
                  : isAssignable ? <Button
                    onClick={() => onAssign(index)}
                    aria-label={`Assign routine to ${patient.name} on ${weekdayNames[index]}`}
                    sx={{ minWidth: 0, width: '100%', p: .5, display: 'flex', flexDirection: 'column', gap: .5, color: 'black', borderRadius: '18px', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: { xs: '.75rem', sm: '.85rem' }, lineHeight: 1.2, '&:hover': { bgcolor: '#c8deda' }, '&.Mui-focusVisible': { outline: '3px solid black', outlineOffset: -2 } }}
                  >
                    <Box component="span" sx={{ width: { xs: 42, sm: 48 }, height: { xs: 42, sm: 48 }, flexShrink: 0, borderRadius: '50%', bgcolor: '#4b9da9', border: '3px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AddIcon sx={{ color: 'white', fontSize: { xs: 30, sm: 36 } }} /></Box>
                    <Box component="span">Assign<br />Routine</Box>
                  </Button>
                    : <Tooltip title={status}><Box sx={{ width: { xs: 42, sm: 66 }, height: { xs: 42, sm: 66 }, flexShrink: 0, borderRadius: '50%', border: '3px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: status === 'missed' ? '#ff333c' : status === 'complete' ? '#8bd153' : status === 'modified' ? '#ffdc55' : '#777777', color: 'white' }}><StatusIcon status={status} /></Box></Tooltip>}
              </Box>
            </Box>
          })}
        </Stack>
      </Box>
      </Box>
    </Collapse>
  </Card>
}

export function DashboardPage() {
  const [expanded, setExpanded] = useState<string[]>(['john'])
  const [query, setQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<SortOrder>('nameAsc')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortMenuAnchor, setSortMenuAnchor] = useState<null | HTMLElement>(null)
  const [filterMenuAnchor, setFilterMenuAnchor] = useState<null | HTMLElement>(null)
  const { assignments, setAssignments } = useOutletContext<DashboardOutletContext>()
  const [assignmentTarget, setAssignmentTarget] = useState<{ patient: Patient; dayIndex: number } | null>(null)
  const visiblePatients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return [...patients]
      .filter((patient) => patient.name.toLowerCase().includes(normalizedQuery))
      .filter((patient) => statusFilter === 'all' || patient.statuses.includes(statusFilter))
      .sort((first, second) => {
        const comparison = first.name.localeCompare(second.name)
        return sortOrder === 'nameAsc' ? comparison : -comparison
      })
  }, [query, sortOrder, statusFilter])
  const allExpanded = visiblePatients.length > 0 && visiblePatients.every((patient) => expanded.includes(patient.id))
  const togglePatient = (id: string) => setExpanded((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const toggleAll = () => setExpanded(allExpanded ? [] : visiblePatients.map((patient) => patient.id))

  const assignRoutine = (routine: Routine) => {
    if (!assignmentTarget) return
    const { patient, dayIndex } = assignmentTarget
    if (patient.statuses[dayIndex] !== 'none') return

    setAssignments((current) => {
      if (current[patient.id]?.[dayIndex]) return current
      return { ...current, [patient.id]: { ...current[patient.id], [dayIndex]: routine } }
    })
    setAssignmentTarget(null)
  }

  return <>
    <Fade in appear timeout={320}>
      <Stack className="dashboard-overview" direction={{ xs: 'column', lg: 'row' }} spacing={{ xs: 2, lg: 5 }} alignItems="stretch">
      <Box flexGrow={1} minWidth={0}>
        <Stack spacing={1.5} mb={3}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.5, sm: 0 }} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ width: '100%', display: { xs: 'flex', sm: 'grid' }, gridTemplateColumns: { sm: 'auto minmax(0, 1fr) auto' }, columnGap: { sm: 1.5 }, rowGap: 1.5 }}>
            <Button onClick={toggleAll} sx={{ flexShrink: 0, bgcolor: 'white', color: 'black', border: '4px solid black', borderRadius: '34px', px: 3, py: 1.25, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.2rem', transition: 'transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease', '&:hover': { bgcolor: '#f5f5f5', transform: 'translateY(-2px)', boxShadow: '0 6px 0 rgba(0, 0, 0, 0.14)' }, '&:active': { transform: 'translateY(0)' } }}>{allExpanded ? 'Collapse All' : 'Expand All'}</Button>
            <OutlinedInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." aria-label="Search patients" startAdornment={<InputAdornment position="start"><SearchIcon sx={{ bgcolor: '#4b9da9', border: '3px solid black', borderRadius: '50%', p: .5, boxSizing: 'content-box', fontSize: 42 }} /></InputAdornment>} sx={{ flexGrow: 1, minWidth: 0, bgcolor: 'white', border: '4px solid black', borderRadius: '34px', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.3rem', '& fieldset': { border: 0 } }} />
            <Stack direction="row" spacing={1.5} sx={{ flexGrow: { sm: 1 }, justifyContent: { sm: 'flex-end' }, alignSelf: { xs: 'flex-end', sm: 'center' } }}>
              <Button startIcon={<SortIcon />} onClick={(event) => setSortMenuAnchor(event.currentTarget)} sx={{ bgcolor: 'white', color: 'black', border: '4px solid black', borderRadius: '34px', px: 3, py: 1.25, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.2rem', transition: 'transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease', '&:hover': { bgcolor: '#f5f5f5', transform: 'translateY(-2px)', boxShadow: '0 6px 0 rgba(0, 0, 0, 0.14)' }, '&:active': { transform: 'translateY(0)' } }}>Sort by</Button>
              <Button startIcon={<FilterListIcon />} onClick={(event) => setFilterMenuAnchor(event.currentTarget)} sx={{ bgcolor: statusFilter === 'all' ? 'white' : '#eb681d', color: statusFilter === 'all' ? 'black' : 'white', border: '4px solid black', borderRadius: '34px', px: 3, py: 1.25, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.2rem', transition: 'transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease', '&:hover': { bgcolor: statusFilter === 'all' ? '#f5f5f5' : '#d15a17', transform: 'translateY(-2px)', boxShadow: '0 6px 0 rgba(0, 0, 0, 0.14)' }, '&:active': { transform: 'translateY(0)' } }}>Filter</Button>
            </Stack>
          </Stack>
          <Menu anchorEl={sortMenuAnchor} open={Boolean(sortMenuAnchor)} onClose={() => setSortMenuAnchor(null)}><MenuItem selected={sortOrder === 'nameAsc'} onClick={() => { setSortOrder('nameAsc'); setSortMenuAnchor(null) }} sx={{ fontFamily: 'Georgia, serif' }}>Name A-Z</MenuItem><MenuItem selected={sortOrder === 'nameDesc'} onClick={() => { setSortOrder('nameDesc'); setSortMenuAnchor(null) }} sx={{ fontFamily: 'Georgia, serif' }}>Name Z-A</MenuItem></Menu>
          <Menu anchorEl={filterMenuAnchor} open={Boolean(filterMenuAnchor)} onClose={() => setFilterMenuAnchor(null)}><MenuItem selected={statusFilter === 'all'} onClick={() => { setStatusFilter('all'); setFilterMenuAnchor(null) }} sx={{ fontFamily: 'Georgia, serif' }}>All Patients</MenuItem><MenuItem selected={statusFilter === 'missed'} onClick={() => { setStatusFilter('missed'); setFilterMenuAnchor(null) }} sx={{ fontFamily: 'Georgia, serif' }}>Missed</MenuItem><MenuItem selected={statusFilter === 'complete'} onClick={() => { setStatusFilter('complete'); setFilterMenuAnchor(null) }} sx={{ fontFamily: 'Georgia, serif' }}>Complete</MenuItem><MenuItem selected={statusFilter === 'modified'} onClick={() => { setStatusFilter('modified'); setFilterMenuAnchor(null) }} sx={{ fontFamily: 'Georgia, serif' }}>Modified</MenuItem><MenuItem selected={statusFilter === 'routine'} onClick={() => { setStatusFilter('routine'); setFilterMenuAnchor(null) }} sx={{ fontFamily: 'Georgia, serif' }}>Routine</MenuItem><MenuItem selected={statusFilter === 'none'} onClick={() => { setStatusFilter('none'); setFilterMenuAnchor(null) }} sx={{ fontFamily: 'Georgia, serif' }}>Unassigned</MenuItem></Menu>
          {visiblePatients.length ? visiblePatients.map((patient) => <PatientRow key={patient.id} patient={patient} expanded={expanded.includes(patient.id)} onToggle={() => togglePatient(patient.id)} assignments={assignments[patient.id] ?? {}} onAssign={(dayIndex) => setAssignmentTarget({ patient, dayIndex })} />) : <Card sx={{ p: 5, textAlign: 'center', border: '4px solid black', bgcolor: 'white' }}><Typography variant="h6" fontFamily="Georgia, serif">No patients found</Typography></Card>}
        </Stack>
      </Box>
      <Box sx={{ width: { xs: '100%', lg: 250 }, display: 'flex', flexDirection: { xs: 'row', lg: 'column' }, justifyContent: 'center', gap: { xs: 2, lg: 6 }, alignItems: 'center' }}><Button component={RouterLink} to="/dashboard/patients/new" sx={{ color: 'black', display: 'flex', flexDirection: 'column', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.65rem', transition: 'transform 180ms ease', '&:hover': { bgcolor: 'transparent', transform: 'translateY(-4px)' } }}><Box className="dashboard-shortcut-orb" sx={{ width: { xs: 110, sm: 170 }, height: { xs: 110, sm: 170 }, borderRadius: '50%', bgcolor: '#4b9da9', border: '4px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 180ms ease, box-shadow 180ms ease' }}><AddIcon sx={{ color: 'white', fontSize: { xs: 70, sm: 120 } }} /></Box><Box component="span" mt={1}>New Patient</Box></Button><Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', lg: 'block' }, borderColor: 'black', borderWidth: 2 }} /><Button component={RouterLink} to="/dashboard/messages" sx={{ color: 'black', display: 'flex', flexDirection: 'column', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.65rem', transition: 'transform 180ms ease', '&:hover': { bgcolor: 'transparent', transform: 'translateY(-4px)' } }}><Box className="dashboard-shortcut-orb" sx={{ position: 'relative', width: { xs: 110, sm: 170 }, height: { xs: 110, sm: 170 }, borderRadius: '50%', bgcolor: '#4b9da9', border: '4px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 180ms ease, box-shadow 180ms ease' }}><ChatBubbleOutlineIcon sx={{ color: 'white', fontSize: { xs: 65, sm: 95 } }} /><Box sx={{ position: 'absolute', top: -2, right: -2, width: 46, height: 46, bgcolor: '#ef1640', borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia, serif', fontStyle: 'normal', fontWeight: 700 }}>3</Box></Box><Box component="span" mt={1}>Messages</Box></Button></Box>
      </Stack>
    </Fade>
    {assignmentTarget && <AssignRoutineDialog
      patientName={assignmentTarget.patient.name}
      weekday={weekdayNames[assignmentTarget.dayIndex]}
      onCancel={() => setAssignmentTarget(null)}
      onAssign={assignRoutine}
    />}
  </>
}
