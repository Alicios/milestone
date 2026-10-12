import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material'
import { supabase } from '../lib/supabase'

type Step = 'loading' | 'enrolled' | 'start' | 'qr'

export function MfaSettings() {
  const [step, setStep] = useState<Step>('loading')
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null)
  const [unverifiedFactorId, setUnverifiedFactorId] = useState<string | null>(null)
  const [pendingFactorId, setPendingFactorId] = useState('')
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function refreshFactors() {
    const { data, error: listError } = await supabase.auth.mfa.listFactors()
    if (listError) { setError(listError.message); setStep('start'); return }
    // data.totp only ever contains verified factors; an abandoned/unverified
    // enrollment only shows up in data.all.
    const verified = data.totp[0]
    const unverified = data.all.find((factor) => factor.factor_type === 'totp' && factor.status === 'unverified')
    setVerifiedFactorId(verified?.id ?? null)
    setUnverifiedFactorId(unverified?.id ?? null)
    setStep(verified ? 'enrolled' : 'start')
  }

  useEffect(() => { void refreshFactors() }, [])

  async function startEnrollment() {
    setBusy(true); setError('')
    try {
      // mfa.enroll() rejects if an abandoned unverified TOTP factor already
      // exists for this user, so clear it out before starting fresh.
      if (unverifiedFactorId) {
        await supabase.auth.mfa.unenroll({ factorId: unverifiedFactorId })
        setUnverifiedFactorId(null)
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (enrollError) throw enrollError
      setPendingFactorId(data.id)
      setQrCodeDataUrl(data.totp.qr_code)
      setSecret(data.totp.secret)
      setStep('qr')
    } catch (enrollCatch) {
      setError(enrollCatch instanceof Error ? enrollCatch.message : 'Could not start enrollment.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from your authenticator app.')
    setBusy(true)
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: pendingFactorId })
      if (challengeError) throw challengeError
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: pendingFactorId, challengeId: challenge.id, code })
      if (verifyError) throw verifyError
      setCode(''); setPendingFactorId(''); setQrCodeDataUrl(''); setSecret('')
      await refreshFactors()
    } catch (verifyCatch) {
      setError(verifyCatch instanceof Error ? verifyCatch.message : 'That code did not match. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function cancelEnrollment() {
    setBusy(true); setError('')
    try {
      if (pendingFactorId) await supabase.auth.mfa.unenroll({ factorId: pendingFactorId })
    } catch (cancelCatch) {
      console.error(cancelCatch)
    } finally {
      setPendingFactorId(''); setQrCodeDataUrl(''); setSecret(''); setCode(''); setBusy(false); setStep('start')
    }
  }

  async function removeMfa() {
    if (!verifiedFactorId) return
    setBusy(true); setError('')
    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: verifiedFactorId })
      if (unenrollError) throw unenrollError
      await refreshFactors()
    } catch (removeCatch) {
      setError(removeCatch instanceof Error ? removeCatch.message : 'Could not remove authenticator app.')
    } finally {
      setBusy(false)
    }
  }

  if (step === 'loading') return <Box py={2}><CircularProgress size={20} /></Box>

  return <Stack spacing={2}>
    {error && <Alert severity="error">{error}</Alert>}

    {step === 'enrolled' && (
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between">
        <Box><Typography fontWeight={700}>Two-factor authentication is on</Typography><Typography variant="body2" color="text.secondary">You'll be asked for a 6-digit code from your authenticator app each time you sign in.</Typography></Box>
        <Button type="button" onClick={removeMfa} variant="outlined" color="secondary" disabled={busy} sx={{ flexShrink: 0 }}>{busy ? 'Removing…' : 'Turn off'}</Button>
      </Stack>
    )}

    {step === 'start' && (
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between">
        <Box><Typography fontWeight={700}>Two-factor authentication is off</Typography><Typography variant="body2" color="text.secondary">Add an authenticator app for an extra layer of login security.</Typography></Box>
        <Button type="button" onClick={startEnrollment} variant="contained" disabled={busy} sx={{ flexShrink: 0 }}>{busy ? 'Starting…' : 'Set up authenticator app'}</Button>
      </Stack>
    )}

    {step === 'qr' && (
      <Stack component="form" onSubmit={confirmEnrollment} spacing={2}>
        <Typography variant="body2" color="text.secondary">Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.), or enter the key manually.</Typography>
        <Box component="img" src={qrCodeDataUrl} alt="Scan this QR code with your authenticator app" sx={{ width: 200, height: 200 }} />
        <Box><Typography variant="subtitle2" color="text.secondary">Manual entry key</Typography><Typography sx={{ overflowWrap: 'anywhere', fontFamily: 'monospace' }}>{secret}</Typography></Box>
        <TextField label="6-digit code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*', maxLength: 6 } }} required />
        <Stack direction="row" spacing={1.5}>
          <Button type="submit" variant="contained" disabled={busy}>{busy ? <CircularProgress size={20} color="inherit" /> : 'Verify and enable'}</Button>
          <Button type="button" onClick={cancelEnrollment} disabled={busy}>Cancel</Button>
        </Stack>
      </Stack>
    )}
  </Stack>
}
