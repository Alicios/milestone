import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import type { RoutineAssignment } from '../types'
import { formatCalendarDate } from '../lib/week'
import { resolveRoutineStatus, type RoutineProgressSignals } from '../lib/routineStatus'
import { RoutineStatusLabel } from './RoutineStatus'
import { PatientRoutineFeedback } from './PatientRoutineFeedback'
import { ExercisePatientFeedback } from './ExercisePatientFeedback'

// Only assignment snapshots enter this component; editable templates are not inputs.
export function AssignedRoutineDetails({ id, assignment, today, signals, loading, error, onRetry, onClose }: {
  id: string
  assignment?: RoutineAssignment
  today?: string
  signals?: RoutineProgressSignals
  loading: boolean
  error: string
  onRetry: () => void
  onClose: () => void
}) {
  const presentation = assignment && resolveRoutineStatus(assignment, today, signals)
  return <Box component="section" id={id} aria-label="Assigned routine details" aria-busy={loading && !error}
    sx={{ mt: 2, p: { xs: 1.5, sm: 2.5 }, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 3, minWidth: 0 }}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
      <Typography component="h2" variant="h6">Assigned routine details</Typography>
      <Button onClick={onClose} sx={{ flexShrink: 0 }}>Collapse details</Button>
    </Stack>
    {error ? <Alert severity="error" action={<Button color="inherit" onClick={onRetry}>Retry details</Button>}>Unable to load assigned routine details. {error}</Alert>
      : loading ? <Typography role="status">Loading assigned routine details…</Typography>
      : !assignment || !presentation ? <Alert severity="info">This assignment is no longer available in this week.</Alert>
      : <>
        <RoutineStatusLabel presentation={presentation} />
        <Typography component="h3" variant="h6" sx={{ mt: 1, overflowWrap: 'anywhere' }}>{assignment.routineName}</Typography>
        <Typography component="time" dateTime={assignment.scheduledDate} color="text.secondary">
          {formatCalendarDate(assignment.scheduledDate, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </Typography>
        <PatientRoutineFeedback assignment={assignment} />
        {assignment.exerciseFeedbackError && <Alert severity="warning" sx={{ mt: 1 }} action={<Button color="inherit" onClick={onRetry}>Retry feedback</Button>}>{assignment.exerciseFeedbackError}</Alert>}
        {!assignment.exercises.length ? <Typography role="status" sx={{ mt: 2 }}>No exercise details were recorded for this assignment.</Typography>
          : <Stack component="ol" spacing={2} sx={{ pl: 3, mb: 0 }}>
            {[...assignment.exercises].sort((a, b) => a.position - b.position).map((exercise) => <Box component="li" key={exercise.id} sx={{ pl: .5, overflowWrap: 'anywhere' }}>
              <Typography component="h4" fontWeight={700}>{exercise.name}</Typography>
              <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1, my: 1 }}>
                {([
                  ['Sets', exercise.sets ?? 'Not specified'],
                  ['Repetitions', exercise.reps ?? 'Not specified'],
                  ['Duration', exercise.durationSeconds == null ? 'Not specified' : `${exercise.durationSeconds} seconds`],
                ] as const).map(([label, value]) => <Box key={label}>
                  <Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
                  <Typography component="dd" sx={{ m: 0 }}>{value}</Typography>
                </Box>)}
                <Box sx={{ gridColumn: '1 / -1' }}>
                  <Typography component="dt" variant="body2" color="text.secondary">Provider notes</Typography>
                  <Typography component="dd" sx={{ m: 0, whiteSpace: 'pre-wrap' }}>{exercise.notes?.trim() ? exercise.notes : 'Not specified'}</Typography>
                </Box>
              </Box>
              <ExercisePatientFeedback feedback={exercise.patientFeedback} unavailable={Boolean(assignment.exerciseFeedbackError)} />
            </Box>)}
          </Stack>}
      </>}
  </Box>
}
