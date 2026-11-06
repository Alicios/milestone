import AddIcon from '@mui/icons-material/Add'
import { Box, Button, Grow, Stack, Typography, useTheme } from '@mui/material'
import type { DayAssignments } from './DashboardLayout'
import type { Patient } from '../data/mockPatients'
import { weekdayNames } from '../data/mockPatients'
import { withinHorizon, type OccupiedDate, type SchedulingPolicy } from '../lib/scheduling'
import { formatCalendarDate } from '../lib/week'
import { resolveRoutineStatus } from '../lib/routineStatus'
import { RoutineStatusButton } from './RoutineStatus'

const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

export function PatientWeekCalendar({ patient, assignments, weekDates, policy, occupied, loading, selectedAssignmentId, detailsId, onSelect, onAssign }: {
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
}) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const border = theme.palette.divider
  const surface = theme.palette.background.paper
  const text = theme.palette.text.primary
  const assignableSurface = isDark ? '#29454d' : '#d9d9d9'
  const neutralSurface = isDark ? '#526970' : '#777777'
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Stack direction="row" spacing={{ xs: .25, sm: .75 }} justifyContent="center" sx={{ minWidth: 616 }}>
        {weekDates.map((date, index) => {
          const day = days[index]
          const dayAssignments = (assignments[weekDates[index]] ?? []).filter((assignment) => assignment.status !== 'cancelled')
          const isOccupied = dayAssignments.length > 0 || occupied.some((entry) => entry.date === date)

          return <Box key={weekDates[index]} sx={{ flex: 1, minWidth: 0, textAlign: 'center', display: 'flex', flexDirection: 'column' }}>
            <Typography sx={{ bgcolor: weekDates[index] === policy?.today ? '#eb681d' : neutralSurface, color: 'white', border: `3px solid ${border}`, borderRadius: '28px', py: { xs: 1, sm: 1.5 }, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 700, fontSize: { xs: '.65rem', sm: '1.05rem' } }}>{day}<br />{formatCalendarDate(weekDates[index])}</Typography>
            <Stack sx={{ mt: .5, bgcolor: isOccupied ? surface : assignableSurface, border: `3px solid ${border}`, borderRadius: '24px', minHeight: { xs: 112, sm: 132 }, flexGrow: 1, p: .5 }} spacing={.5}>
              {dayAssignments.map((assignment) => <Grow in key={assignment.id} timeout={220}><Box>
                <RoutineStatusButton name={assignment.routineName} date={assignment.scheduledDate}
                  presentation={resolveRoutineStatus(assignment, policy?.today)!}
                  expanded={selectedAssignmentId === assignment.id} controls={detailsId}
                  onClick={() => onSelect(assignment.id)} />
              </Box></Grow>)}
              {isOccupied ? <Typography variant="caption" color="text.secondary" sx={{ py: .75 }}>Occupied</Typography> :
              <Button disabled={loading || !withinHorizon(date, policy)} onClick={() => onAssign(index)} aria-label={`Assign routine to ${patient.name} on ${weekdayNames[index]}`} sx={{ minWidth: 0, width: '100%', flexGrow: 1, p: .5, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: .5, color: text, borderRadius: '18px', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: { xs: '.7rem', sm: '.8rem' }, lineHeight: 1.2, '&:hover': { bgcolor: isDark ? '#35545c' : '#c8deda' }, '&.Mui-focusVisible': { outline: `3px solid ${border}`, outlineOffset: -2 } }}>
                <Box component="span" sx={{ width: 38, height: 38, flexShrink: 0, borderRadius: '50%', bgcolor: '#4b9da9', border: `3px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AddIcon sx={{ color: 'white', fontSize: 28 }} /></Box>
                <Box component="span">Assign<br />Routine</Box>
              </Button>}
            </Stack>
          </Box>
        })}
      </Stack>
    </Box>
  )
}
