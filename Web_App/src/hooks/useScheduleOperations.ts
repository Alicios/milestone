import { AppError, normalizeError } from '../lib/errors'
import { useCallback, useEffect, useRef, useState } from 'react'
import { findScheduleReceipt, submitSchedule } from '../lib/schedulingData'
import { ScheduleRecovery, SingleFlight } from '../lib/scheduleRecovery'
import { isDefinitiveScheduleFailure, scheduleError, verifiedReceipt, type ConfirmedSelection, type ScheduleOperation } from '../lib/scheduling'

export function useScheduleOperations(providerId: string | undefined, onSaved: () => Promise<void>) {
  const [pending, setPending] = useState<ScheduleOperation[]>([])
  const [busy, setBusy] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [storageError, setStorageError] = useState('')
  const active = useRef(providerId)
  active.current = providerId
  const saved = useRef(onSaved)
  saved.current = onSaved
  const flights = useRef(new SingleFlight())
  const recovery = () => new ScheduleRecovery(window.localStorage)
  const reload = useCallback(() => {
    if (!providerId || active.current !== providerId) return
    try { setPending(recovery().list(providerId)); setStorageError('') }
    catch { setStorageError('Scheduling recovery storage could not be read. Check browser storage settings before confirming another schedule.'); }
  }, [providerId])
  const finish = useCallback(async (operation: ScheduleOperation) => {
    try { recovery().remove(operation); reload() }
    catch { setNotice('Schedule saved; the recovery record could not be cleared from this browser. Checking it again is safe.') }
    try { await saved.current() }
    catch { setNotice('Schedule saved, but the calendar could not be reloaded. Reload assignments; do not repeat the save.') }
    return true
  }, [reload])

  const recover = useCallback((operation: ScheduleOperation, retry = false) => flights.current.run(operation.requestId, async () => {
    if (active.current !== operation.providerId) return false
    setBusy((values) => [...values, operation.requestId])
    let submitted = false
    try {
      // Receipt lookup is read-only. No automatic write after a lost response.
      let receipt = await findScheduleReceipt(operation.requestId)
      if (active.current !== operation.providerId) return false
      if (!receipt && retry) { submitted = true; receipt = await submitSchedule(operation) }
      if (active.current !== operation.providerId) return false
      if (!receipt) {
        setNotice('The original request has no confirmed receipt yet. You can check again or explicitly retry the same confirmed request. No new request ID will be created.')
        return false
      }
      verifiedReceipt(receipt, operation)
      setNotice('Schedule saved. The original request receipt was recovered.')
      return await finish(operation)
    } catch (error) {
      if (active.current !== operation.providerId) return false
      // Only a rejection from an actual retry proves rollback. A failed lookup
      // alone says nothing about the outcome of the original write.
      if (submitted && isDefinitiveScheduleFailure(error)) {
        try { recovery().remove(operation); reload(); setNotice(scheduleError(error)) }
        catch { setNotice('The retry was rejected, but recovery storage could not be updated. Keep the original request information for support.') }
      } else setNotice('The outcome is still unconfirmed. Recovery information has been retained. Check again when your connection is restored.')
      return false
    } finally { if (active.current === operation.providerId) setBusy((values) => values.filter((id) => id !== operation.requestId)) }
  }), [reload, finish])

  useEffect(() => {
    active.current = providerId
    setPending([]); setNotice(''); setBusy([]); reload()
    if (providerId) {
      try { for (const operation of recovery().list(providerId)) void recover(operation) }
      catch { /* reload presents the storage error */ }
    }
    window.addEventListener('storage', reload)
    window.addEventListener('focus', reload)
    return () => { active.current = undefined; window.removeEventListener('storage', reload); window.removeEventListener('focus', reload) }
  }, [providerId, reload, recover])

  const confirm = (patientProfileId: string, entries: ConfirmedSelection[]) => flights.current.run(`confirm:${providerId}:${patientProfileId}`, async () => {
    if (!providerId || active.current !== providerId) throw new AppError('AUTH_REQUIRED', { message: 'Sign in before confirming a schedule.' })
    if (storageError || recovery().list(providerId).some((entry) => entry.patientProfileId === patientProfileId)) {
      throw new AppError('CONFLICT', { message: 'Resolve the previous confirmed schedule for this patient before submitting another.' })
    }
    const operation: ScheduleOperation = { providerId, patientProfileId, requestId: crypto.randomUUID(), entries }
    try { recovery().retain(operation) }
    catch { throw new AppError('SERVICE_UNAVAILABLE', { message: 'Recovery information could not be stored. No schedule was submitted. Check your browser storage settings.' }) }
    reload()
    try {
      await submitSchedule(operation)
    } catch (error) {
      if (active.current !== providerId) return false
      if (isDefinitiveScheduleFailure(error)) {
        recovery().remove(operation); reload(); throw normalizeError(error, { operation: 'schedule' })
      }
      setNotice('The save response was lost. Your confirmed request is retained below. Check its receipt before retrying.')
      return false
    }
    // Write success and refresh failure are separate outcomes. Never repeat a
    // confirmed write to fix a read failure.
    if (active.current !== providerId) return false
    return finish(operation)
  })
  return { pending: pending.filter((entry) => entry.providerId === providerId), busy, notice, storageError, confirm, recover }
}
