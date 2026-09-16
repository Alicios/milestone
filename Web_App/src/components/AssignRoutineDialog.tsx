import { useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Radio, RadioGroup, Typography } from '@mui/material'
import { mockRoutines, type Routine } from '../data/mockRoutines'

interface AssignRoutineDialogProps {
  patientName: string
  weekday: string
  onCancel: () => void
  onAssign: (routine: Routine) => void
}

export function AssignRoutineDialog({ patientName, weekday, onCancel, onAssign }: AssignRoutineDialogProps) {
  const [selectedRoutineId, setSelectedRoutineId] = useState('')
  const selectedRoutine = mockRoutines.find((routine) => routine.id === selectedRoutineId)
  const buttonSx = { color: 'black', border: '3px solid black', borderRadius: '24px', px: 3, fontFamily: 'Georgia, serif', fontStyle: 'italic' }

  return <Dialog
    open
    onClose={onCancel}
    fullWidth
    maxWidth="sm"
    aria-labelledby="assign-routine-title"
    aria-describedby="assign-routine-context"
    slotProps={{ paper: { sx: { bgcolor: '#e8ddba', color: 'black', border: '4px solid black', borderRadius: '28px' } } }}
  >
    <DialogTitle id="assign-routine-title" sx={{ bgcolor: '#4b9da9', color: 'white', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>Assign Routine</DialogTitle>
    <DialogContent>
      <Typography id="assign-routine-context" sx={{ my: 2, fontFamily: 'Georgia, serif', fontSize: '1.2rem', overflowWrap: 'anywhere' }}>
        {patientName} · {weekday}
      </Typography>
      <Typography sx={{ mb: 1.5, fontFamily: 'Georgia, serif' }}>Choose one of your existing routines.</Typography>
      <RadioGroup
        aria-label="Existing provider routines"
        name="routine"
        value={selectedRoutineId}
        onChange={(_, value) => setSelectedRoutineId(value)}
        sx={{ gap: 1 }}
      >
        {mockRoutines.map((routine, index) => <FormControlLabel
          key={routine.id}
          value={routine.id}
          control={<Radio autoFocus={index === 0} sx={{ color: 'black', '&.Mui-checked': { color: 'black' } }} />}
          label={routine.name}
          sx={{
            m: 0, px: 1, py: .5, border: '2px solid black', borderRadius: '18px',
            bgcolor: selectedRoutineId === routine.id ? '#91c8c0' : 'white',
            '& .MuiFormControlLabel-label': { minWidth: 0, fontFamily: 'Georgia, serif', fontStyle: 'italic', overflowWrap: 'anywhere' },
          }}
        />)}
      </RadioGroup>
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
      <Button onClick={onCancel} sx={{ ...buttonSx, bgcolor: 'white', '&:hover': { bgcolor: '#f5f5f5' } }}>Cancel</Button>
      <Button
        disabled={!selectedRoutine}
        onClick={() => { if (selectedRoutine) onAssign(selectedRoutine) }}
        sx={{ ...buttonSx, bgcolor: '#91c8c0', '&:hover': { bgcolor: '#82bdb5' }, '&.Mui-disabled': { bgcolor: '#d3d3d3', color: '#666666' } }}
      >Assign</Button>
    </DialogActions>
  </Dialog>
}
