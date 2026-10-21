import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material'
import type { Routine } from '../types'
import { previewSchedule } from '../lib/schedulingData'
import { RequestEpoch, scheduleError, weeklySelections, withinHorizon, type ConfirmedSelection, type SchedulePreview, type SchedulingPolicy } from '../lib/scheduling'
import { weekdayNames } from '../data/mockPatients'
import { prescriptionSummary } from '../lib/prescriptions'
import { formatCalendarDate } from '../lib/week'

interface Props {
  patientName: string; patientProfileId: string; routines: Routine[]; weekStart: string
  singleDate?: string; policy: SchedulingPolicy; onCancel: () => void
  onConfirm: (entries: ConfirmedSelection[]) => Promise<boolean>
}
export function ScheduleRoutineDialog({ patientName, patientProfileId, routines, weekStart, singleDate, policy: initialPolicy, onCancel, onConfirm }: Props) {
  const [pattern, setPattern] = useState(Array<string>(7).fill(''))
  const [singleRoutine, setSingleRoutine] = useState('')
  const [repeat, setRepeat] = useState(false)
  const [policy, setPolicy] = useState(initialPolicy)
  const [preview, setPreview] = useState<SchedulePreview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const pending = useRef(false)
  const epoch = useRef(new RequestEpoch())
  useEffect(() => () => epoch.current.invalidate(), [])
  useEffect(() => { if (!preview && !busy) setPolicy(initialPolicy) }, [initialPolicy, preview, busy])
  const entries = useMemo(() => singleDate
    ? (singleRoutine && withinHorizon(singleDate, policy) ? [{ date: singleDate, routineId: singleRoutine }] : [])
    : weeklySelections(weekStart, pattern, repeat, policy), [singleDate, singleRoutine, weekStart, pattern, repeat, policy])
  const loadPreview = async () => {
    if (pending.current) return
    pending.current = true; setBusy(true); setError('')
    const current = epoch.current.next()
    try {
      const value = await previewSchedule(patientProfileId, entries)
      if (current()) { setPolicy(value.policy); setPreview(value) }
    } catch (error) { if (current()) setError(scheduleError(error)) }
    finally { if (current()) { pending.current = false; setBusy(false) } }
  }
  const confirm = async () => {
    if (!preview || pending.current) return
    pending.current = true; setBusy(true); setError('')
    const current = epoch.current.next()
    try {
      const saved = await onConfirm(preview.entries.map(({ date, routineId, token }) => ({ date, routineId, token })))
      if (!current()) return
      if (saved) onCancel()
      else setUncertain(true)
    } catch (error) { if (current()) { setError(scheduleError(error)); setPreview(null) } }
    finally { if (current()) { pending.current = false; setBusy(false) } }
  }
  return <Dialog open fullWidth maxWidth="sm" onClose={busy ? undefined : onCancel} aria-labelledby="schedule-title">
    <DialogTitle id="schedule-title">{singleDate ? 'Schedule routine' : 'Weekly routine schedule'}</DialogTitle>
    <DialogContent>
      <Typography fontWeight={700} sx={{ my: 1 }}>{patientName}</Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>Scheduling dates: {policy.today} through {policy.lastDate} ({policy.timeZone}). One active routine per date.</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {uncertain ? <Alert severity="warning">The outcome is unconfirmed. Close this dialog and use the saved request recovery controls. Do not create another schedule for these dates.</Alert> : preview ? <Stack spacing={2}>
        <Typography component="h2" variant="h6">Preview · {preview.entries.length} assignment{preview.entries.length === 1 ? '' : 's'}</Typography>
        <Typography variant="body2">Confirming captures these prescriptions permanently. Template changes require a new preview.</Typography>
        {preview.conflicts.length > 0 && <Alert severity="error">Nothing will be saved while dates conflict. Cancel existing assignments explicitly before replacing them. Dates: {preview.conflicts.map((entry) => entry.date).join(', ')}.</Alert>}
        {preview.entries.map((entry) => <Box key={entry.date} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
          <Typography fontWeight={700}>{formatCalendarDate(entry.date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · {entry.routineName}</Typography>
          {entry.exercises.map((exercise) => <Box key={exercise.position} sx={{ mt: 1 }}><Typography>{exercise.position + 1}. {exercise.name}{prescriptionSummary(exercise) && ` · ${prescriptionSummary(exercise)}`}</Typography>
            {exercise.notes && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{exercise.notes}</Typography>}</Box>)}
        </Box>)}
      </Stack> : <Stack spacing={2}>
        {!routines.length && <Alert severity="info">Create and save a routine before scheduling it.</Alert>}
        {singleDate ? <TextField select fullWidth label={`Routine for ${singleDate}`} disabled={busy} value={singleRoutine} onChange={(event) => setSingleRoutine(event.target.value)}>
          <MenuItem value="">Select a routine</MenuItem>{routines.map((routine) => <MenuItem key={routine.id} value={routine.id}>{routine.name}</MenuItem>)}
        </TextField> : <>
          <Typography>Week beginning {weekStart}. Rest days leave existing assignments unchanged.</Typography>
          {weekdayNames.map((day, index) => <TextField select fullWidth key={day} label={day} disabled={busy} value={pattern[index]} onChange={(event) => setPattern((values) => values.map((value, i) => i === index ? event.target.value : value))}>
            <MenuItem value="">Rest · no new assignment</MenuItem>{routines.map((routine) => <MenuItem key={routine.id} value={routine.id}>{routine.name}</MenuItem>)}
          </TextField>)}
          <FormControlLabel control={<Checkbox checked={repeat} disabled={busy} onChange={(_, checked) => setRepeat(checked)} />} label="Repeat weekly through the remaining scheduling window" />
        </>}
        <Typography role="status">{entries.length} proposed assignment{entries.length === 1 ? '' : 's'}. Dates outside the scheduling window are excluded.</Typography>
      </Stack>}
    </DialogContent>
    <DialogActions>
      <Button disabled={busy} onClick={onCancel}>Close</Button>
      {!uncertain && (preview ? <><Button disabled={busy} onClick={() => setPreview(null)}>Edit schedule</Button><Button variant="contained" disabled={busy || preview.conflicts.length > 0} onClick={() => void confirm()}>{busy ? 'Confirming…' : 'Confirm schedule'}</Button></>
        : <Button variant="contained" disabled={busy || !entries.length} onClick={() => void loadPreview()}>{busy ? 'Loading preview…' : 'Preview schedule'}</Button>)}
    </DialogActions>
  </Dialog>
}
