import { supabase } from './supabase'
import { normalizeError } from './errors'
import { verifiedReceipt } from './scheduling'
import type { OccupiedDate, ScheduleOperation, SchedulePreview, ScheduleReceipt, ScheduleSelection, SchedulingPolicy } from './scheduling'

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  try {
    const { data, error, status } = await supabase.rpc(name, args)
    if (error) throw normalizeError(error, { operation: name, status })
    return data as T
  } catch (error) {
    throw normalizeError(error, { operation: name })
  }
}
export const loadSchedulingPolicy = () => rpc<SchedulingPolicy>('get_routine_scheduling_policy')
export const loadScheduleOccupancy = (patientProfileId: string, start: string, end: string) => rpc<OccupiedDate[]>('get_patient_schedule_occupancy', {
  p_patient_profile_id: patientProfileId, p_start_date: start, p_end_date: end,
})
export const previewSchedule = (patientProfileId: string, entries: ScheduleSelection[]) => rpc<SchedulePreview>('preview_routine_schedule', {
  p_patient_profile_id: patientProfileId, p_entries: entries,
})
export const findScheduleReceipt = (requestId: string) => rpc<ScheduleReceipt | null>('get_routine_schedule_request', { p_request_id: requestId })
export async function submitSchedule(operation: ScheduleOperation) {
  const receipt = await rpc<ScheduleReceipt>('assign_routine_schedule', {
    p_patient_profile_id: operation.patientProfileId, p_request_id: operation.requestId, p_entries: operation.entries,
  })
  // A malformed/empty transport response is uncertain, never treated as a rejection.
  return verifiedReceipt(receipt, operation)
}
