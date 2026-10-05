import { useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Fade, FormControlLabel, Radio, RadioGroup, Typography, useTheme } from '@mui/material'
import type { Routine } from '../types'
import { formatCalendarDate } from '../lib/week'

interface AssignRoutineDialogProps {
  patientName: string
  weekday: string
  scheduledDate: string
  routines: Routine[]
  onCancel: () => void
  onAssign: (routine: Routine) => Promise<void>
}

export function AssignRoutineDialog({ patientName, weekday, scheduledDate, routines, onCancel, onAssign }: AssignRoutineDialogProps) {
  const theme = useTheme()
  const border = theme.palette.divider
  const text = theme.palette.text.primary
  const surface = theme.palette.background.paper
  const selectedSurface = theme.palette.mode === 'dark' ? '#214b52' : '#91c8c0'
  const [selectedRoutineId, setSelectedRoutineId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const selectedRoutine = routines.find((routine) => routine.id === selectedRoutineId)
  const buttonSx = { color: text, border: `3px solid ${border}`, borderRadius: '24px', px: 3, fontFamily: 'Georgia, serif', fontStyle: 'italic' }

  return <Dialog open onClose={saving ? undefined : onCancel} fullWidth maxWidth="sm" slots={{ transition: Fade }} aria-labelledby="assign-routine-title" aria-describedby="assign-routine-context" slotProps={{ transition: { timeout: 220 }, paper: { sx: { bgcolor: 'background.paper', color: 'text.primary', border: `4px solid ${border}`, borderRadius: '28px' } } }}>
    <DialogTitle id="assign-routine-title" sx={{ bgcolor: '#4b9da9', color: 'white', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>Assign Routine</DialogTitle>
    <DialogContent>
      <Typography id="assign-routine-context" sx={{ my: 2, fontFamily: 'Georgia, serif', fontSize: '1.2rem', overflowWrap: 'anywhere' }}>
        {patientName} · {weekday}, {formatCalendarDate(scheduledDate, { month: 'long', day: 'numeric', year: 'numeric' })}
      </Typography>
      <Typography sx={{ mb: 1.5, fontFamily: 'Georgia, serif' }}>Choose one of your existing routines.</Typography>
      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
      {!routines.length && <Alert severity="info">Create a routine before assigning one to a patient.</Alert>}
      <RadioGroup aria-label="Existing provider routines" name="routine" value={selectedRoutineId} onChange={(_, value) => setSelectedRoutineId(value)} sx={{ gap: 1 }}>
        {routines.map((routine, index) => <FormControlLabel key={routine.id} value={routine.id} control={<Radio autoFocus={index === 0} sx={{ color: 'text.secondary', '&.Mui-checked': { color: 'primary.main' } }} />} label={routine.name} sx={{ m: 0, px: 1, py: .5, border: `2px solid ${border}`, borderRadius: '18px', bgcolor: selectedRoutineId === routine.id ? selectedSurface : surface, '& .MuiFormControlLabel-label': { minWidth: 0, fontFamily: 'Georgia, serif', fontStyle: 'italic', overflowWrap: 'anywhere' } }} />)}
      </RadioGroup>
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
      <Button disabled={saving} onClick={onCancel} sx={{ ...buttonSx, bgcolor: surface, '&:hover': { bgcolor: theme.palette.action.hover } }}>Cancel</Button>
      <Button disabled={!selectedRoutine || saving} onClick={() => {
        if (!selectedRoutine) return
        setSaving(true)
        setError('')
        void onAssign(selectedRoutine).catch((assignmentError: Error) => {
          setError(assignmentError.message || 'The routine could not be assigned.')
          setSaving(false)
        })
      }} sx={{ ...buttonSx, bgcolor: '#91c8c0', color: '#102b34', '&:hover': { bgcolor: '#82bdb5' }, '&.Mui-disabled': { bgcolor: theme.palette.action.disabledBackground, color: theme.palette.action.disabled } }}>{saving ? 'Assigning…' : 'Assign'}</Button>
    </DialogActions>
  </Dialog>
}
