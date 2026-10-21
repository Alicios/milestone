import type { RoutineExercise } from '../types'

export interface SchedulingPolicy { today: string; lastDate: string; horizonDays: number; timeZone: string }
export interface ScheduleSelection { date: string; routineId: string }
export interface ConfirmedSelection extends ScheduleSelection { token: string }
export interface OccupiedDate { date: string; assignmentId: string | null; routineName: string | null }
export interface SchedulePreview {
  policy: SchedulingPolicy
  entries: (ConfirmedSelection & { routineName: string; exercises: RoutineExercise[] })[]
  occupied: OccupiedDate[]
  conflicts: OccupiedDate[]
}
export interface ScheduleOperation { providerId: string; patientProfileId: string; requestId: string; entries: ConfirmedSelection[] }
export interface ScheduleReceipt { requestId: string; patientProfileId: string; assignments: { id: string; date: string; routineId: string }[] }

export function verifiedReceipt(value: unknown, operation: ScheduleOperation): ScheduleReceipt {
  const receipt = value as ScheduleReceipt | null
  if (!receipt || receipt.requestId !== operation.requestId || receipt.patientProfileId !== operation.patientProfileId
    || !Array.isArray(receipt.assignments) || receipt.assignments.length !== operation.entries.length
    || new Set(receipt.assignments.map((entry) => entry?.id)).size !== operation.entries.length
    || new Set(receipt.assignments.map((entry) => entry?.date)).size !== operation.entries.length
    || receipt.assignments.some((entry) => !entry || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(entry.id)
      || !operation.entries.some((selection) => selection.date === entry.date && selection.routineId === entry.routineId))) {
    throw new Error('The server receipt could not be verified. Retain this request for recovery.')
  }
  return receipt
}

// UTC is used only for date arithmetic, never to decide the current clinical date.
// That date and the inclusive horizon are supplied by the server policy RPC.
export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
export function weekDatesFor(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  const monday = addDays(date, -(weekday === 0 ? 6 : weekday - 1))
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
}
export function withinHorizon(date: string, policy: SchedulingPolicy | null) {
  return Boolean(policy && date >= policy.today && date <= policy.lastDate)
}
export function weeklySelections(weekStart: string, pattern: string[], repeat: boolean, policy: SchedulingPolicy): ScheduleSelection[] {
  const end = repeat ? policy.lastDate : addDays(weekStart, 6)
  const entries: ScheduleSelection[] = []
  for (let date = weekStart > policy.today ? weekStart : policy.today; date <= end && date <= policy.lastDate; date = addDays(date, 1)) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    const routineId = pattern[weekday === 0 ? 6 : weekday - 1]
    if (routineId && withinHorizon(date, policy)) entries.push({ date, routineId })
  }
  return entries
}

// A new request or invalidation makes every older response ineligible to publish.
export class RequestEpoch {
  private version = 0
  next() { const version = ++this.version; return () => version === this.version }
  invalidate() { this.version++ }
}

export function isDefinitiveScheduleFailure(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return Boolean(code && ['22023', '22007', '22P02', '23505', '23514', '42501', 'P0002', '40001', '55000', 'PGRST202'].includes(code))
}
export function scheduleError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  if (code === '23505') return 'One or more selected dates already have an active assignment. Nothing was scheduled. Explicitly cancel the existing assignment before replacing it.'
  if (code === '40001') return 'A selected routine changed. Nothing was scheduled. Review a new preview before confirming.'
  if (code === 'PGRST202') return 'Scheduling is unavailable until the scheduling database update has been reviewed and deployed.'
  return (error as { message?: string } | null)?.message || 'The schedule could not be loaded. Please retry.'
}
