import { useRef, useState, type FormEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@mui/material'
import type { Patient } from '../data/mockPatients'
import type { DashboardOutletContext } from './DashboardLayout'
import { validatePatientDetails, type PatientDetailsInput } from '../lib/supabaseData'
import { errorMessage } from '../lib/errors'

export function PatientDetailsDialog({ patient, onClose, onSaved }: { patient: Patient; onClose: () => void; onSaved: () => void }) {
  const { updatePatientDetails } = useOutletContext<DashboardOutletContext>()
  const [draft, setDraft] = useState<PatientDetailsInput>({ name: patient.name, email: patient.email ?? '', phone: patient.phone ?? '', primaryConcern: patient.primaryConcern ?? '', treatmentFocus: patient.treatmentFocus ?? '', startOfCare: patient.startOfCare ?? '', careStatus: patient.careStatus })
  const [errors, setErrors] = useState<Partial<Record<keyof PatientDetailsInput, string>>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const nameInput = useRef<HTMLInputElement>(null)
  function change<K extends keyof PatientDetailsInput>(key: K, value: PatientDetailsInput[K]) {
    setDraft(previous => ({ ...previous, [key]: value }))
    setErrors(previous => ({ ...previous, [key]: undefined }))
    setError('')
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (pending.current) return
    const nextErrors = validatePatientDetails(draft)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    pending.current = true
    setSaving(true)
    setError('')
    try { await updatePatientDetails(patient.id, draft); onSaved() }
    catch (failure) { setError(errorMessage(failure, 'Patient details could not be saved.')); pending.current = false; setSaving(false) }
  }
  const field = (key: Exclude<keyof PatientDetailsInput, 'careStatus'>, label: string, options = {}) => <TextField key={key} label={label} value={draft[key]} onChange={event => change(key, event.target.value)} disabled={saving} error={Boolean(errors[key])} helperText={errors[key]} fullWidth {...options} />
  return <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="patient-details-title" slotProps={{ transition: { onEntered: () => nameInput.current?.focus() } }}>
    <form onSubmit={event => void save(event)} noValidate>
      <DialogTitle id="patient-details-title">Edit patient details</DialogTitle>
      <DialogContent><Stack spacing={2.5} sx={{ pt: 1 }}>
        {error && <Alert severity="error">{error}</Alert>}
        {field('name', 'Full name', { required: true, autoFocus: true, inputRef: nameInput, autoComplete: 'name', slotProps: { htmlInput: { maxLength: 200 } } })}
        {field('email', 'Email address', { type: 'email', autoComplete: 'email', slotProps: { htmlInput: { maxLength: 320 } } })}
        {field('phone', 'Phone number', { type: 'tel', autoComplete: 'tel', slotProps: { htmlInput: { maxLength: 64 } } })}
        {field('primaryConcern', 'Primary concern', { multiline: true, minRows: 2, slotProps: { htmlInput: { maxLength: 4000 } } })}
        {field('treatmentFocus', 'Treatment focus', { multiline: true, minRows: 2, slotProps: { htmlInput: { maxLength: 4000 } } })}
        {field('startOfCare', 'Start of care', { type: 'date', slotProps: { inputLabel: { shrink: true } } })}
        <TextField select label="Care status" value={draft.careStatus} onChange={event => change('careStatus', event.target.value as PatientDetailsInput['careStatus'])} disabled={saving} error={Boolean(errors.careStatus)} helperText={errors.careStatus}>
          <MenuItem value="pending">Pending</MenuItem><MenuItem value="active">Active</MenuItem>
        </TextField>
      </Stack></DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}><Button disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : 'Save patient details'}</Button></DialogActions>
    </form>
  </Dialog>
}
