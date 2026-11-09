import { addDays, weekDatesFor } from './scheduling'

export function shiftMonth(date: string, amount: number) {
  const value = new Date(`${date.slice(0, 7)}-01T12:00:00Z`)
  value.setUTCMonth(value.getUTCMonth() + amount)
  return value.toISOString().slice(0, 10)
}

export function monthDatesFor(date: string) {
  const first = `${date.slice(0, 7)}-01`
  const last = addDays(shiftMonth(first, 1), -1)
  const start = weekDatesFor(first)[0]
  const end = weekDatesFor(last)[6]
  const dates: string[] = []
  for (let day = start; day <= end; day = addDays(day, 1)) dates.push(day)
  return dates
}
