import { Box, Typography, useTheme } from '@mui/material'
import type { ExercisePatientFeedback as Feedback } from '../types'

export function ExercisePatientFeedback({ feedback, unavailable = false, embedded = false }: { feedback?: Feedback; unavailable?: boolean; embedded?: boolean }) {
  const dark = useTheme().palette.mode === 'dark'
  if (unavailable) return null
  if (!feedback) return <Typography variant="body2" sx={{ mt: .75 }}>Patient pain: Not rated</Typography>
  const colors = feedback.painScore <= 3
    ? { bg: dark ? '#204b36' : '#d4eddd', fg: dark ? '#dcf8e7' : '#174c30' }
    : feedback.painScore <= 6 ? { bg: dark ? '#584b1e' : '#fff1b8', fg: dark ? '#fff2b8' : '#594400' }
      : { bg: dark ? '#792333' : '#fbe0e0', fg: dark ? '#fff1f3' : '#792d32' }
  return <Box component="section" aria-label="Patient exercise feedback" sx={{ mt: 1, p: embedded ? 0 : 1.5, border: embedded ? 0 : 1, borderStyle: embedded ? 'none' : 'solid', borderColor: 'divider', borderRadius: 2, minWidth: 0 }}>
    <Typography variant="subtitle2">Patient exercise feedback</Typography>
    <Box component="span" aria-label={`Pain: ${feedback.painScore} out of 10`} data-pain-score={feedback.painScore}
      sx={{ display: 'inline-block', bgcolor: colors.bg, color: colors.fg, fontWeight: 700, borderRadius: 1, px: 1, py: .5, mt: .75 }}>
      Pain: {feedback.painScore}/10
    </Box>
    <Typography variant="body2" sx={{ mt: .75 }}>Feeling: {{ good: 'Good', neutral: 'Neutral', difficult: 'Difficult' }[feedback.feeling]}</Typography>
    {feedback.explanation && <Typography variant="body2" sx={{ mt: .5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{feedback.explanation}</Typography>}
    <Typography variant="caption" component="p" sx={{ m: 0, mt: .75 }}>
      Reported <Box component="time" dateTime={feedback.reportedAt}>{new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(feedback.reportedAt))}</Box>
    </Typography>
  </Box>
}
