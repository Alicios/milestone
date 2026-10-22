import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadRoutineAssignments } from '../lib/supabaseData'
import { loadScheduleOccupancy, loadSchedulingPolicy } from '../lib/schedulingData'
import { RequestEpoch, scheduleError, weekDatesFor, type OccupiedDate, type SchedulingPolicy } from '../lib/scheduling'
import type { RoutineAssignment } from '../types'

export type AssignmentCalendar = Record<string, Record<string, RoutineAssignment[]>>
export function useAssignmentCalendar(providerId: string | undefined, profileIds: string[]) {
  const [policy, setPolicy] = useState<SchedulingPolicy | null>(null)
  const [selectedWeek, setSelectedWeek] = useState('')
  const [rows, setRows] = useState<{ key: string; assignments: AssignmentCalendar; occupied: Record<string, OccupiedDate[]> } | null>(null)
  const [error, setError] = useState('')
  const [policyError, setPolicyError] = useState('')
  const [loading, setLoading] = useState(false)
  const epoch = useRef(new RequestEpoch())
  const policyEpoch = useRef(new RequestEpoch())
  const inFlight = useRef<{ key: string; current: () => boolean; promise: Promise<void> } | null>(null)
  const ids = [...profileIds].sort().join(',')
  const weekStart = selectedWeek || (policy ? weekDatesFor(policy.today)[0] : '')
  const weekDates = useMemo(() => weekStart ? weekDatesFor(weekStart) : [], [weekStart])
  const key = `${providerId}/${ids}/${weekStart}`
  const activeKey = useRef(key)
  activeKey.current = key
  const activeProvider = useRef(providerId)
  activeProvider.current = providerId

  const refreshPolicy = useCallback(async () => {
    if (!providerId) return
    const current = policyEpoch.current.next()
    try {
      const next = await loadSchedulingPolicy()
      if (current() && activeProvider.current === providerId) { setPolicy(next); setPolicyError('') }
    } catch (error) {
      if (current() && activeProvider.current === providerId) setPolicyError(scheduleError(error))
    }
  }, [providerId])
  const refresh = useCallback((): Promise<void> => {
    if (!providerId || !weekStart) return Promise.resolve()
    if (inFlight.current?.key === key && inFlight.current.current()) return inFlight.current.promise
    const current = epoch.current.next()
    const eligible = () => current() && activeKey.current === key
    setLoading(true)
    // A failed refresh must not leave old assignments looking current.
    setRows(null)
    const promise = (async () => {
      try {
        const profiles = ids ? ids.split(',') : []
        const [assignments, occupied] = await Promise.all([
          loadRoutineAssignments(profiles, weekDates[0], weekDates[6]),
          Promise.all(profiles.map(async (id) => [id, await loadScheduleOccupancy(id, weekDates[0], weekDates[6])] as const)),
        ])
        if (!eligible()) return
        const grouped: AssignmentCalendar = {}
        for (const assignment of assignments) {
          const patient = grouped[assignment.patientProfileId] ??= {}
          const day = patient[assignment.scheduledDate] ??= []
          day.push(assignment)
        }
        setRows({ key, assignments: grouped, occupied: Object.fromEntries(occupied) })
        setError('')
      } catch (error) {
        if (eligible()) { setError(scheduleError(error)); throw error }
      } finally {
        if (eligible()) setLoading(false)
      }
    })()
    inFlight.current = { key, current, promise }
    void promise.finally(() => { if (inFlight.current?.promise === promise) inFlight.current = null }).catch(() => {})
    return promise
  }, [providerId, ids, weekStart, weekDates, key])
  const invalidate = useCallback(() => { epoch.current.invalidate(); setRows(null) }, [])

  useEffect(() => {
    setPolicy(null); setSelectedWeek(''); setRows(null); setError(''); setPolicyError('')
    void refreshPolicy()
    return () => { policyEpoch.current.invalidate(); epoch.current.invalidate() }
  }, [refreshPolicy])
  useEffect(() => {
    void refresh().catch(() => {})
    return () => epoch.current.invalidate()
  }, [refresh])
  useEffect(() => {
    const reload = () => { invalidate(); void refreshPolicy(); void refresh().catch(() => {}) }
    const storageChanged = (event: StorageEvent) => { if (event.key === 'milestone.schedule.changed') reload() }
    // Other tabs and returning to the tab both invalidate current assumptions.
    window.addEventListener('focus', reload)
    window.addEventListener('storage', storageChanged)
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') reload() }, 60_000)
    return () => { window.removeEventListener('focus', reload); window.removeEventListener('storage', storageChanged); window.clearInterval(timer) }
  }, [refresh, refreshPolicy, invalidate])
  return { policy, weekDates, setWeek: setSelectedWeek, refreshPolicy, refresh, invalidate,
    assignments: rows?.key === key ? rows.assignments : {}, occupied: rows?.key === key ? rows.occupied : {},
    loading: loading || !rows || rows.key !== key, refreshing: loading, error: policyError || error }
}
