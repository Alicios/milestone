import { Button, Stack, Typography } from '@mui/material'
import { addDays, weekDatesFor, type SchedulingPolicy } from '../lib/scheduling'
import { formatCalendarDate } from '../lib/week'

export function CalendarWeekNavigation({ dates, policy, onChange }: { dates: string[]; policy: SchedulingPolicy | null; onChange: (week: string) => void }) {
  if (!dates.length) return null
  return <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ my: 2 }}>
    <Button aria-label="Previous calendar week" onClick={() => onChange(addDays(dates[0], -7))}>Previous</Button>
    <Typography component="span" aria-live="polite">{formatCalendarDate(dates[0], { month: 'short', day: 'numeric', year: 'numeric' })} – {formatCalendarDate(dates[6])}</Typography>
    <Button aria-label="Next calendar week" onClick={() => onChange(addDays(dates[0], 7))}>Next</Button>
    <Button disabled={!policy} onClick={() => policy && onChange(weekDatesFor(policy.today)[0])}>This week</Button>
  </Stack>
}
