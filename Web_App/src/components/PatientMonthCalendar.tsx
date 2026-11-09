import { useId } from 'react'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import AddIcon from '@mui/icons-material/Add'
import { Box, Button, IconButton, Stack, Typography } from '@mui/material'
import type { DayAssignments } from './DashboardLayout'
import type { Patient } from '../data/mockPatients'
import { shiftMonth } from '../lib/calendarMonth'
import { withinHorizon, type OccupiedDate, type SchedulingPolicy } from '../lib/scheduling'
import { formatCalendarDate } from '../lib/week'
import { resolveRoutineStatus } from '../lib/routineStatus'
import { RoutineStatusButton } from './RoutineStatus'

export function PatientMonthCalendar({ patient, month, dates, assignments, occupied, policy, loading, selectedAssignmentId, detailsId, onSelect, onAssign, onMonthChange }: {
  patient: Patient; month: string; dates: string[]; assignments: DayAssignments
  occupied: OccupiedDate[]; policy: SchedulingPolicy | null; loading: boolean
  selectedAssignmentId: string | null; detailsId: string
  onSelect: (id: string) => void; onAssign: (date: string) => void; onMonthChange: (month: string) => void
}) {
  const headingId = useId()
  const weeks = Array.from({ length: dates.length / 7 }, (_, index) => dates.slice(index * 7, index * 7 + 7))
  return <Box component="section" aria-label={`Monthly calendar for ${patient.name}`} sx={{ minWidth: 0, border: 1, borderColor: 'divider', borderRadius: '12px', overflow: 'hidden', bgcolor: 'background.paper' }}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ px: { xs: 1, sm: 2 }, py: 1, borderBottom: 1, borderColor: 'divider' }}>
      <Typography id={headingId} component="h3" aria-live="polite" sx={{ minWidth: 0, fontWeight: 700, fontSize: { xs: '.875rem', sm: '1rem' } }}>{formatCalendarDate(month, { month: 'long', year: 'numeric' })}</Typography>
      <Stack role="group" aria-label="Calendar month controls" direction="row" alignItems="center" sx={{ flexShrink: 0 }}>
        <IconButton aria-label="Previous calendar month" onClick={() => onMonthChange(shiftMonth(month, -1))}><ChevronLeftIcon /></IconButton>
        <IconButton aria-label="Next calendar month" onClick={() => onMonthChange(shiftMonth(month, 1))}><ChevronRightIcon /></IconButton>
        <Button disabled={!policy} onClick={() => policy && onMonthChange(`${policy.today.slice(0, 7)}-01`)} sx={{ px: .75, minWidth: 0, whiteSpace: 'nowrap', fontSize: '.75rem' }}>This month</Button>
      </Stack>
    </Stack>
    <Box role="region" aria-label={`Month days and routines for ${patient.name}`} tabIndex={0} sx={{ overflowX: 'auto', overscrollBehaviorX: 'contain', '&:focus-visible': { outline: '3px solid #eb681d', outlineOffset: -3 } }}>
      <Box component="table" aria-labelledby={headingId} sx={{ width: '100%', minWidth: 784, tableLayout: 'fixed', borderCollapse: 'collapse', '& th, & td': { width: `${100 / 7}%`, borderRight: 1, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderRight: 0 } } }}>
        <Box component="thead"><Box component="tr">
          {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(day => <Box component="th" scope="col" key={day} sx={{ p: 1, bgcolor: 'action.hover', fontSize: '.6875rem', letterSpacing: '.08em' }}>{day}</Box>)}
        </Box></Box>
        <Box component="tbody">{weeks.map(week => <Box component="tr" key={week[0]}>{week.map(date => {
          const entries = (assignments[date] ?? []).filter(entry => entry.status !== 'cancelled')
          const isOccupied = entries.length > 0 || occupied.some(entry => entry.date === date)
          const outsideMonth = date.slice(0, 7) !== month.slice(0, 7)
          return <Box component="td" key={date} aria-label={formatCalendarDate(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} aria-current={date === policy?.today ? 'date' : undefined}
            sx={{ p: 1, verticalAlign: 'top', bgcolor: outsideMonth ? 'action.hover' : date === policy?.today ? 'action.selected' : undefined }}>
            <Stack spacing={.75} sx={{ minHeight: 120 }}>
              <Typography component="time" dateTime={date} sx={{ fontWeight: 700, color: outsideMonth ? 'text.secondary' : date === policy?.today ? 'primary.main' : 'text.primary' }}>{formatCalendarDate(date, { day: 'numeric', ...(outsideMonth ? { month: 'short' } : {}) })}</Typography>
              {entries.map(entry => <RoutineStatusButton key={entry.id} name={entry.routineName} date={date} presentation={resolveRoutineStatus(entry, policy?.today)!} expanded={selectedAssignmentId === entry.id} controls={detailsId} onClick={() => onSelect(entry.id)} />)}
              {isOccupied ? <Typography variant="caption" color="text.secondary">Occupied</Typography> : <Button startIcon={<AddIcon />} disabled={Boolean(patient.dischargedAt) || loading || !withinHorizon(date, policy)} onClick={() => onAssign(date)} aria-label={`Assign routine to ${patient.name} on ${formatCalendarDate(date, { month: 'long', day: 'numeric', year: 'numeric' })}`} sx={{ minHeight: 44, minWidth: 0, px: .5, fontSize: '.75rem', mt: 'auto' }}>Assign routine</Button>}
            </Stack>
          </Box>
        })}</Box>)}</Box>
      </Box>
    </Box>
  </Box>
}
