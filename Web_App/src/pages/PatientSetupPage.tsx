import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link as RouterLink, useOutletContext, useParams } from 'react-router-dom'
import { Alert, Box, Button, Card, Chip, Stack, TextField, Typography } from '@mui/material'
import type { DashboardOutletContext } from '../components/DashboardLayout'
import { usePatientOnboardingDetails } from '../hooks/usePatientOnboarding'
import { generateOnboardingCode, onboardingLabels, OnboardingRequestError, savePatientOnboarding } from '../lib/patientOnboarding'

export function PatientSetupPage() {
  const { patientId = '' } = useParams()
  return <PatientSetupEditor key={patientId} patientId={patientId} />
}
function PatientSetupEditor({ patientId }: { patientId: string }) {
  const { retryPatients } = useOutletContext<DashboardOutletContext>()
  const { data, loading, error: loadError, refresh } = usePatientOnboardingDetails(patientId)
  const [draft, setDraft] = useState<{ name: string; email: string } | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState<'save' | 'code' | null>(null)
  const [completed, setCompleted] = useState(false)
  const [needsRepair, setNeedsRepair] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const pending = useRef(false)
  useEffect(() => { if (data) setDraft(current => current ?? { name: data.name, email: data.email }) }, [data])
  const dirty = Boolean(data && draft && (draft.name !== data.name || draft.email !== data.email))
  const nameError = attempted && (!draft?.name.trim() || draft.name.trim().length > 200)
  const emailError = attempted && (!draft?.email.trim() || draft.email.trim().length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()))
  const carePath = `/dashboard/patients/${encodeURIComponent(patientId)}`
  function failure(caught: unknown) {
    setError(caught instanceof OnboardingRequestError ? caught.message : 'The request could not be confirmed. Reload this page before trying again.')
    if (caught instanceof OnboardingRequestError && caught.code === 'SETUP_COMPLETE') setCompleted(true)
    if (caught instanceof OnboardingRequestError && caught.code === 'RECONCILIATION_REQUIRED') setNeedsRepair(true)
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setAttempted(true)
    if (pending.current || !draft || !draft.name.trim() || draft.name.trim().length > 200 || draft.email.trim().length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) return
    pending.current = true; setBusy('save'); setError(''); setNotice('')
    try {
      const saved = await savePatientOnboarding(patientId, draft.name, draft.email)
      setDraft({ name: saved.name, email: saved.email }); setNeedsRepair(false)
      setNotice(saved.emailChanged ? 'Details saved. Generate a new login code for the corrected email address.' : 'Patient details saved.')
      retryPatients(); await refresh()
    } catch (caught) { failure(caught); await refresh() }
    finally { pending.current = false; setBusy(null) }
  }
  async function generate() {
    if (pending.current || dirty || needsRepair || data?.needsReconciliation) return
    pending.current = true; setBusy('code'); setError(''); setNotice('')
    try { await generateOnboardingCode(patientId); retryPatients(); await refresh(); setNotice('New login code generated. Give it directly to the patient.') }
    catch (caught) { failure(caught); await refresh() }
    finally { pending.current = false; setBusy(null) }
  }
  return <Box component="main" sx={{ maxWidth: 800, mx: 'auto', py: 2 }}>
    <Button component={RouterLink} to="/dashboard" sx={{ mb: 2 }}>Back to Patients</Button>
    <Typography component="h1" variant="h4" sx={{ mb: 3 }}>Patient setup</Typography>
    {loading ? <Typography role="status">Loading patient setup…</Typography>
      : loadError || !data || !draft ? <Alert severity="error" action={<Button onClick={() => void refresh()}>Retry setup</Button>}>{loadError || 'Patient setup is unavailable.'}</Alert>
      : <Card sx={{ p: { xs: 2.5, sm: 4 } }}>
        <Stack spacing={2.5}>
          <Typography component="h2" variant="h6" sx={{ overflowWrap: 'anywhere' }}>{data.name}</Typography>
          <Chip label={onboardingLabels[data.status]} sx={{ alignSelf: 'flex-start' }} />
          {notice && <Alert severity="success" role="status">{notice}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          {data.setupComplete || completed ? <Alert severity="info">This patient has completed setup. Continue on their patient care page.</Alert> : <>
            {(needsRepair || data.needsReconciliation) && <Alert severity="warning">Save the correct details again to synchronize the account before generating a code.</Alert>}
            <Box component="form" onSubmit={event => void save(event)} noValidate aria-busy={Boolean(busy)}>
              <Stack spacing={2.5}>
                <TextField label="Full name" autoFocus autoComplete="name" required fullWidth value={draft.name} disabled={Boolean(busy)}
                  onChange={event => setDraft({ ...draft, name: event.target.value })} error={Boolean(nameError)} helperText={nameError ? 'Enter a name of 1 to 200 characters.' : ''} />
                <TextField label="Email address" type="email" autoComplete="email" required fullWidth value={draft.email} disabled={Boolean(busy)}
                  onChange={event => setDraft({ ...draft, email: event.target.value })} error={Boolean(emailError)} helperText={emailError ? 'Enter a valid email address.' : 'Used for the patient’s app sign-in.'} />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <Button type="submit" variant="contained" disabled={Boolean(busy) || (!dirty && !needsRepair && !data.needsReconciliation)}>{busy === 'save' ? 'Saving…' : 'Save changes'}</Button>
                  <Button component={RouterLink} to="/dashboard" disabled={Boolean(busy)}>Cancel</Button>
                </Stack>
              </Stack>
            </Box>
            {dirty && <Typography variant="body2" color="text.secondary">Save your changes before generating a login code.</Typography>}
            {!dirty && !needsRepair && !data.needsReconciliation && data.code && data.codeExpiresAt && Date.parse(data.codeExpiresAt) > Date.now() && <Alert severity="info">
              <Typography>Give this code directly to the patient:</Typography>
              <Typography sx={{ fontWeight: 800, fontSize: '2rem', letterSpacing: 4 }}>{data.code}</Typography>
              <Typography variant="body2">No email is sent. The code expires in about an hour after generation.</Typography>
            </Alert>}
            <Button variant="outlined" disabled={Boolean(busy) || dirty || needsRepair || data.needsReconciliation || !data.email}
              onClick={() => void generate()}>{busy === 'code' ? 'Generating…' : 'Generate new login code'}</Button>
          </>}
          <Button component={RouterLink} to={carePath}>Open patient care page</Button>
        </Stack>
      </Card>}
  </Box>
}
