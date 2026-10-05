export function toLocalDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getCurrentWeekDates(now = new Date()) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = monday.getDay()
  monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1))
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return toLocalDateKey(date)
  })
}

export function formatCalendarDate(dateKey: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', options).format(new Date(year, month - 1, day))
}
