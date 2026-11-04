import { Box, Typography } from '@mui/material'
import type { RoutineAssignment } from '../types'

export function PatientRoutineFeedback({ assignment }: { assignment: RoutineAssignment }) {
  const result = assignment.patientResult
  if (!result || (!result.comment?.trim() && !result.issue && !result.inProgress && !result.source)) return null
  return <Box component="section" aria-label="Patient routine feedback" sx={{ mt: 1.5, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2, minWidth: 0 }}>
    <Typography component="h3" variant="subtitle2">Patient feedback{result.source === 'demo' ? ' · Demo result' : ''}</Typography>
    {result.source === 'demo' && <Typography variant="caption" component="p" sx={{ m: 0, mt: .5 }}>Sample patient comment for demonstration.</Typography>}
    {assignment.status === 'completed' && <Typography variant="body2" sx={{ mt: .5 }}>Routine completed</Typography>}
    {result.issue && <Typography variant="body2" fontWeight={700} sx={{ mt: .5 }}>
      {result.issue === 'critical' ? 'Critical issue reported' : 'Difficulty reported'}
    </Typography>}
    <Typography variant="body2" sx={{ mt: .75, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {result.comment?.trim() ? result.comment : 'No patient comment provided.'}
    </Typography>
  </Box>
}
