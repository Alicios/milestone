import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { Button, IconButton, Stack, Typography } from '@mui/material'
import { addDays, weekDatesFor, type SchedulingPolicy } from '../lib/scheduling'
import { formatCalendarDate } from '../lib/week'

export function CalendarWeekNavigation({ dates, policy, onChange }: { dates: string[]; policy: SchedulingPolicy | null; onChange: (week: string) => void }) {
  if (!dates.length) return null
  return <Stack role="group" aria-label="Calendar week controls" direction="row" spacing={.25} alignItems="center" sx={{ position: 'relative', flexShrink: 0,
    '& .MuiIconButton-root': { width: 36, height: 36, borderRadius: '8px', color: 'primary.main', '&.Mui-focusVisible': { outline: '3px solid #eb681d', outlineOffset: -3 } } }}>
    <IconButton aria-label="Previous calendar week" onClick={() => onChange(addDays(dates[0], -7))}><ChevronLeftIcon /></IconButton>
    <Typography component="span" aria-live="polite" sx={{ position: 'absolute', width: '1px', height: '1px', p: 0, m: '-1px', overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }}>{formatCalendarDate(dates[0], { month: 'short', day: 'numeric', year: 'numeric' })} – {formatCalendarDate(dates[6])}</Typography>
    <IconButton aria-label="Next calendar week" onClick={() => onChange(addDays(dates[0], 7))}><ChevronRightIcon /></IconButton>
    <Button disabled={!policy} onClick={() => policy && onChange(weekDatesFor(policy.today)[0])} sx={{ whiteSpace: 'nowrap', minWidth: 0, minHeight: 36, '&.MuiButton-root': { px: .75, fontSize: '.75rem', alignItems: 'center' } }}>This week</Button>
  </Stack>
}
