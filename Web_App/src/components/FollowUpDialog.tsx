import { useMemo, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material'
import type { RoutineAssignment } from '../types'

function toLocalInputValue(iso?: string) {
  const date = iso ? new Date(iso) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function FollowUpDialog({ assignment, onCancel, onSave }: {
  assignment: RoutineAssignment
  onCancel: () => void
  onSave: (scheduledAt: string) => Promise<void>
}) {
  const initialValue = useMemo(() => toLocalInputValue(assignment.followUp?.scheduledAt), [assignment.followUp?.scheduledAt])
  const [scheduledAt, setScheduledAt] = useState(initialValue)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  return <Dialog open onClose={saving ? undefined : onCancel} fullWidth maxWidth="xs" aria-labelledby="follow-up-title">
    <DialogTitle id="follow-up-title">{assignment.followUp?.status === 'scheduled' ? 'Reschedule follow-up' : 'Schedule follow-up'}</DialogTitle>
    <DialogContent>
      <Typography sx={{ mt: 1, mb: 2 }}>Choose a follow-up date and time for <strong>{assignment.routineName}</strong>.</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <TextField label="Follow-up date and time" type="datetime-local" fullWidth required value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 2 }}>
      <Button disabled={saving} onClick={onCancel}>Cancel</Button>
      <Button variant="contained" disabled={!scheduledAt || saving} onClick={() => {
        setSaving(true)
        setError('')
        void onSave(new Date(scheduledAt).toISOString()).catch((saveError: Error) => {
          setError(saveError.message || 'The follow-up could not be scheduled.')
          setSaving(false)
        })
      }}>{saving ? 'Saving…' : 'Save follow-up'}</Button>
    </DialogActions>
  </Dialog>
}
