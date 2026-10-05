import { useId, useRef } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'

interface RemoveRoutineDialogProps {
  patientName: string
  weekday: string
  routineName?: string
  onCancel: () => void
  onRemove: () => void
}

export function RemoveRoutineDialog({ patientName, weekday, routineName, onCancel, onRemove }: RemoveRoutineDialogProps) {
  const id = useId()
  const cancelButton = useRef<HTMLButtonElement>(null)

  return <Dialog
    open
    onClose={onCancel}
    fullWidth
    maxWidth="xs"
    aria-labelledby={`${id}-title`}
    aria-describedby={`${id}-description`}
    slotProps={{ transition: { onEntered: () => cancelButton.current?.focus() } }}
  >
    <DialogTitle id={`${id}-title`}>Cancel routine assignment?</DialogTitle>
    <DialogContent>
      <DialogContentText id={`${id}-description`} sx={{ overflowWrap: 'anywhere' }}>
        Cancel {routineName ? <strong>{routineName}</strong> : 'the scheduled routine'} for <strong>{weekday}</strong> for {patientName}? Its history will be retained, and any scheduled follow-up will also be cancelled.
      </DialogContentText>
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 2 }}>
      <Button ref={cancelButton} autoFocus onClick={onCancel}>Cancel</Button>
      <Button color="error" onClick={onRemove}>Cancel Assignment</Button>
    </DialogActions>
  </Dialog>
}
