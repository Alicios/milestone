import { useState } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import { AssignedRoutineDetails } from '../components/AssignedRoutineDetails'
import { RoutineStatusButton, RoutineStatusCard, RoutineStatusLegend } from '../components/RoutineStatus'
import { resolveRoutineStatus, type RoutineProgressSignals } from '../lib/routineStatus'
import type { RoutineAssignment } from '../types'

const samples: { name: string; status: RoutineAssignment['status']; signals?: RoutineProgressSignals }[] = [
  { name: 'Mobility routine', status: 'scheduled' },
  { name: 'Balance routine', status: 'completed' },
  { name: 'Strength routine', status: 'scheduled', signals: { inProgress: true } },
  { name: 'Stretching routine', status: 'completed', signals: { issue: 'noncritical' } },
  { name: 'Walking routine', status: 'missed' },
  { name: 'Recovery routine', status: 'completed', signals: { issue: 'critical' } },
]

export function RoutineStatusPreviewPage() {
  const [selected, setSelected] = useState<number | null>(null)
  const rows = samples.map((sample, index) => ({
    ...sample,
    assignment: { id: `sample-${index}`, patientProfileId: 'sample', routineId: 'sample', scheduledDate: '2026-11-03',
      routineName: sample.name, status: sample.status, exercises: [{ id: 'sample-exercise', name: 'Exercise', position: 0, sets: 2, reps: 10 }] } satisfies RoutineAssignment,
  }))
  return <Box component="main" sx={{ maxWidth: 1100, mx: 'auto' }}>
    <Typography component="h1" variant="h4" sx={{ mb: 2 }}>Routine status preview</Typography>
    <Typography component="h2" variant="h6" sx={{ mb: 1 }}>Weekly routine buttons</Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(6, minmax(0, 1fr))' }, gap: 1, alignItems: 'start' }}>
      {rows.map((row, index) => <RoutineStatusButton key={row.name} name={row.name} date={row.assignment.scheduledDate}
        presentation={resolveRoutineStatus(row.assignment, '2026-11-03', row.signals)!}
        expanded={selected === index} controls="preview-details" onClick={() => setSelected(selected === index ? null : index)} />)}
    </Box>
    {selected !== null && <AssignedRoutineDetails id="preview-details" assignment={rows[selected].assignment} signals={rows[selected].signals}
      today="2026-11-03" loading={false} error="" onRetry={() => {}} onClose={() => setSelected(null)} />}
    <RoutineStatusLegend />
    <Typography component="h2" variant="h6" sx={{ mt: 3, mb: 1 }}>Patient routine cards</Typography>
    <Stack spacing={1.5}>
      {rows.map((row) => <RoutineStatusCard key={row.name} presentation={resolveRoutineStatus(row.assignment, '2026-11-03', row.signals)!}>
        <Typography fontWeight={700}>{row.name}</Typography>
        <Typography variant="body2">Exercise · 2 sets · 10 reps</Typography>
      </RoutineStatusCard>)}
    </Stack>
    <RoutineStatusLegend />
  </Box>
}
