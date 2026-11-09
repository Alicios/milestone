import AddIcon from '@mui/icons-material/Add'
import { useId } from 'react'
import { Box, Button, Grow, Stack, Typography, useTheme } from '@mui/material'
import type { DayAssignments } from './DashboardLayout'
import type { Patient } from '../data/mockPatients'
import { weekdayNames } from '../data/mockPatients'
import { withinHorizon, type OccupiedDate, type SchedulingPolicy } from '../lib/scheduling'
import { formatCalendarDate } from '../lib/week'
import { resolveRoutineStatus } from '../lib/routineStatus'
import { RoutineStatusButton } from './RoutineStatus'
import { CalendarWeekNavigation } from './CalendarWeekNavigation'

const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

function monthHeading(dates: string[]) {
  const first = dates[0]
  const last = dates[dates.length - 1]
  if (first.slice(0, 7) === last.slice(0, 7)) return formatCalendarDate(first, { month: 'long', year: 'numeric' })
  if (first.slice(0, 4) === last.slice(0, 4)) {
    return `${formatCalendarDate(first, { month: 'long' })}–${formatCalendarDate(last, { month: 'long', year: 'numeric' })}`
  }
  return `${formatCalendarDate(first, { month: 'long', year: 'numeric' })}–${formatCalendarDate(last, { month: 'long', year: 'numeric' })}`
}

export function PatientWeekCalendar({ patient, assignments, weekDates, policy, occupied, loading, selectedAssignmentId, detailsId, onSelect, onAssign, onWeekChange }: {
  patient: Patient
  assignments: DayAssignments
  weekDates: string[]
  policy: SchedulingPolicy | null
  occupied: OccupiedDate[]
  loading: boolean
  selectedAssignmentId: string | null
  detailsId: string
  onSelect: (id: string) => void
  onAssign: (dayIndex: number) => void
  onWeekChange: (week: string) => void
}) {
  const theme = useTheme()
  const headingId = useId()
  const isDark = theme.palette.mode === 'dark'
  const headerSurface = isDark ? '#234650' : '#f3f8f8'
  if (!weekDates.length) return null
  return (
    <Box component="section" aria-label={`Weekly calendar for ${patient.name}`} sx={{ minWidth: 0, width: '100%', bgcolor: 'background.paper', color: 'text.primary', border: 1, borderColor: 'divider', borderRadius: '12px', overflow: 'hidden',
      '& .MuiButton-root': { fontFamily: 'inherit', fontStyle: 'normal', fontSize: '.8125rem', borderRadius: '10px', boxShadow: 'none', p: 1, textAlign: 'left', alignItems: 'flex-start' },
      '& [data-routine-status] .MuiTypography-root': { maxWidth: '100%', boxSizing: 'border-box', fontSize: '.6875rem', letterSpacing: 0, overflowWrap: 'normal' } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: { xs: 1, sm: 2 }, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography id={headingId} component="h3" sx={{ minWidth: 0, overflowWrap: 'anywhere', fontWeight: 700, fontSize: { xs: '.875rem', sm: '1rem' } }}>{monthHeading(weekDates)}</Typography>
        <CalendarWeekNavigation dates={weekDates} policy={policy} onChange={onWeekChange} />
      </Box>
      <Box role="region" aria-label={`Days and routines for ${patient.name}`} tabIndex={0} sx={{ overflowX: 'auto', overscrollBehaviorX: 'contain', '&:focus-visible': { outline: '3px solid #eb681d', outlineOffset: -3 } }}>
        <Box component="table" aria-labelledby={headingId} sx={{ width: '100%', minWidth: 784, tableLayout: 'fixed', borderCollapse: 'collapse',
          '& th, & td': { width: `${100 / 7}%`, borderRight: 1, borderColor: 'divider', '&:last-child': { borderRight: 0 } } }}>
          <Box component="thead">
            <Box component="tr">
              {weekDates.map((date, index) => <Box component="th" scope="col" key={date} aria-current={date === policy?.today ? 'date' : undefined}
                sx={{ p: 1.25, textAlign: 'center', bgcolor: date === policy?.today ? (isDark ? '#503c2e' : '#fff1e7') : headerSurface, borderBottom: 1, borderColor: 'divider' }}>
                <Typography component="time" dateTime={date} aria-label={formatCalendarDate(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  sx={{ display: 'block', fontWeight: 700, fontSize: '1.5rem', lineHeight: 1.3, color: date === policy?.today ? (isDark ? '#ffaf78' : '#b74c0b') : 'text.primary' }}>{formatCalendarDate(date, { day: 'numeric' })}</Typography>
                <Typography component="span" sx={{ display: 'block', mt: .25, fontSize: '.6875rem', fontWeight: 700, letterSpacing: '.08em', color: 'text.secondary' }}>{days[index]}</Typography>
              </Box>)}
            </Box>
          </Box>
          <Box component="tbody">
            <Box component="tr">
              {weekDates.map((date, index) => {
                const dayAssignments = (assignments[date] ?? []).filter((assignment) => assignment.status !== 'cancelled')
                const isOccupied = dayAssignments.length > 0 || occupied.some((entry) => entry.date === date)

                return <Box component="td" key={date} sx={{ verticalAlign: 'top', p: 1 }}>
                  <Stack sx={{ minHeight: 144 }} spacing={1}>
                    {dayAssignments.map((assignment) => <Grow in key={assignment.id} timeout={220}><Box>
                      <RoutineStatusButton name={assignment.routineName} date={assignment.scheduledDate}
                        presentation={resolveRoutineStatus(assignment, policy?.today)!}
                        expanded={selectedAssignmentId === assignment.id} controls={detailsId}
                        onClick={() => onSelect(assignment.id)} />
                    </Box></Grow>)}
                    {isOccupied ? <Typography variant="caption" color="text.secondary" sx={{ py: .75, textAlign: 'center' }}>Occupied</Typography> :
                    <Button disabled={Boolean(patient.dischargedAt) || loading || !withinHorizon(date, policy)} onClick={() => onAssign(index)} aria-label={`Assign routine to ${patient.name} on ${weekdayNames[index]}`} sx={{ minWidth: 0, width: '100%', minHeight: 144, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: .75, color: 'text.secondary', lineHeight: 1.4, '&.MuiButton-root': { alignItems: 'center', textAlign: 'center' }, '&:hover': { bgcolor: headerSurface } }}>
                      <AddIcon sx={{ color: 'primary.main', fontSize: 22 }} />
                      <Box component="span">Assign routine</Box>
                    </Button>}
                  </Stack>
                </Box>
              })}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
