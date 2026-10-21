import { useId, useRef, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'

interface RemoveRoutineDialogProps {
  patientName: string
  weekday: string
  routineName?: string
  onCancel: () => void
  onRemove: () => Promise<void>
}

export function RemoveRoutineDialog({ patientName, weekday, routineName, onCancel, onRemove }: RemoveRoutineDialogProps) {
  const id = useId()
  const cancelButton = useRef<HTMLButtonElement>(null)
  const pending = useRef(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  return <Dialog
    open
    onClose={saving ? undefined : onCancel}
    fullWidth
    maxWidth="xs"
    aria-labelledby={`${id}-title`}
    aria-describedby={`${id}-description`}
    slotProps={{ transition: { onEntered: () => cancelButton.current?.focus() } }}
  >
    <DialogTitle id={`${id}-title`}>Cancel routine assignment?</DialogTitle>
    <DialogContent>
      {error && <Alert severity="error">{error}</Alert>}
      <DialogContentText id={`${id}-description`} sx={{ overflowWrap: 'anywhere' }}>
        Cancel {routineName ? <strong>{routineName}</strong> : 'the scheduled routine'} for <strong>{weekday}</strong> for {patientName}? Its history will be retained, and any scheduled follow-up will also be cancelled.
      </DialogContentText>
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 2 }}>
      <Button ref={cancelButton} disabled={saving} autoFocus onClick={onCancel}>Close</Button>
      <Button color="error" disabled={saving} onClick={() => {
        if (pending.current) return
        pending.current = true; setSaving(true); setError('')
        void onRemove().catch(() => setError('Cancellation could not be confirmed. Reload the calendar or retry cancellation; retrying cannot recreate an assignment.'))
          .finally(() => { pending.current = false; setSaving(false) })
      }}>{saving ? 'Cancelling…' : 'Cancel Assignment'}</Button>
    </DialogActions>
  </Dialog>
}
