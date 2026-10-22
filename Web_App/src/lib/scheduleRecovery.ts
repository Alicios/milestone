import type { ScheduleOperation } from './scheduling'

const prefix = 'milestone.schedule.v1.'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// One immutable record per confirmed operation avoids tabs overwriting each
// other's recovery information. No patient names or prescriptions are stored.
export class ScheduleRecovery {
  constructor(private storage: Storage) {}
  private key(operation: ScheduleOperation) { return `${prefix}${operation.providerId}.${operation.requestId}` }
  retain(operation: ScheduleOperation) {
    const key = this.key(operation)
    const payload = JSON.stringify(operation)
    const existing = this.storage.getItem(key)
    if (existing && existing !== payload) throw new Error('This confirmed request cannot be changed. Recover it before creating another.')
    this.storage.setItem(key, payload)
    if (this.storage.getItem(key) !== payload) throw new Error('Recovery storage is unavailable. No schedule was submitted.')
  }
  remove(operation: ScheduleOperation) { this.storage.removeItem(this.key(operation)) }
  list(providerId: string): ScheduleOperation[] {
    const operations: ScheduleOperation[] = []
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i)
      if (!key?.startsWith(`${prefix}${providerId}.`)) continue
      const value = JSON.parse(this.storage.getItem(key) || 'null') as ScheduleOperation | null
      if (!value || value.providerId !== providerId || !uuid.test(value.requestId) || !uuid.test(value.patientProfileId)
        || !Array.isArray(value.entries) || !value.entries.length || value.entries.some((entry) => !uuid.test(entry.routineId)
          || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !/^[0-9a-f]{64}$/.test(entry.token))) {
        throw new Error('Saved scheduling recovery information is damaged. Do not resubmit; contact support to check the original request.')
      }
      operations.push(value)
    }
    return operations
  }
}

// Synchronous guard also covers clicks occurring before React renders pending UI.
export class SingleFlight {
  private flights = new Map<string, Promise<unknown>>()
  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const current = this.flights.get(key)
    if (current) return current as Promise<T>
    const promise = Promise.resolve().then(work)
    this.flights.set(key, promise)
    void promise.finally(() => { if (this.flights.get(key) === promise) this.flights.delete(key) }).catch(() => {})
    return promise
  }
}
