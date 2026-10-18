import { Temporal } from '@js-temporal/polyfill'

export const ZONE = 'America/Los_Angeles'
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export type CalendarSource = 'manual' | 'ics' | 'google' | 'microsoft' | 'screenshot'
export type CalendarEvent = {
  id: string
  source: CalendarSource
  sourceEventId: string
  title: string
  start: string
  end: string
  timeZone: string
  category: 'class' | 'other' | 'unclassified'
  location: string
  buildingCode: string
  room: string
  section: string
  notes: string
  allDay: boolean
  recurrence: { days: number[]; until: string } | null
}
export type ManualDraft = {
  title: string
  section: string
  date: string
  until: string
  start: string
  end: string
  days: number[]
  location: string
  buildingCode: string
  room: string
  notes: string
  category: CalendarEvent['category']
}
export const today = () => Temporal.Now.plainDateISO(ZONE).toString()
export function localInstant(date: string, time: string, zone = ZONE) {
  return Temporal.PlainDateTime.from(`${date}T${time}`)
    .toZonedDateTime(zone, { disambiguation: 'reject' })
    .toInstant()
    .toString()
}
export function inZone(instant: string, zone = ZONE) {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(zone)
}
export function weekDays(date: string) {
  const day = Temporal.PlainDate.from(date)
  const monday = day.subtract({ days: day.dayOfWeek - 1 })
  return DAYS.map((_, i) => monday.add({ days: i }).toString())
}
export function manualEvent(d: ManualDraft, existing?: CalendarEvent): CalendarEvent {
  if (!d.title.trim()) throw new Error('Enter a course or event name.')
  if (!d.location.trim())
    throw new Error('Enter a building; unknown buildings must be corrected before routing.')
  const start = localInstant(d.date, d.start),
    end = localInstant(d.date, d.end)
  if (Date.parse(end) <= Date.parse(start))
    throw new Error('End time must be after start time on the same day.')
  if (
    d.until &&
    (d.until < d.date ||
      Temporal.PlainDate.from(d.date).until(Temporal.PlainDate.from(d.until)).days > 370)
  )
    throw new Error('Choose an end date within one year after the first date.')
  if (d.days.some((day) => day < 1 || day > 7)) throw new Error('Invalid recurrence day.')
  const id = existing?.id ?? crypto.randomUUID()
  return {
    id,
    source: existing?.source ?? 'manual',
    sourceEventId: existing?.sourceEventId ?? id,
    title: d.title.trim().slice(0, 300),
    start,
    end,
    timeZone: ZONE,
    category: d.category,
    location: d.location.trim().slice(0, 160),
    buildingCode: d.buildingCode.trim(),
    room: d.room.trim(),
    section: d.section.trim(),
    notes: d.notes.slice(0, 2000),
    allDay: false,
    recurrence: d.days.length
      ? {
          days: [...new Set(d.days)].sort(),
          until: d.until || Temporal.PlainDate.from(d.date).add({ days: 120 }).toString(),
        }
      : null,
  }
}
export function occurrences(
  events: CalendarEvent[],
  from: string,
  through: string,
): CalendarEvent[] {
  const first = Temporal.PlainDate.from(from),
    last = Temporal.PlainDate.from(through)
  if (first.until(last).days > 370) throw new Error('Limit calendar expansion to one year.')
  const out: CalendarEvent[] = []
  for (const event of events) {
    const start = inZone(event.start, event.timeZone),
      end = inZone(event.end, event.timeZone)
    if (!event.recurrence) {
      const date = inZone(event.start).toPlainDate().toString()
      if (date >= from && date <= through) out.push(event)
      continue
    }
    for (
      let date = first;
      Temporal.PlainDate.compare(date, last) <= 0;
      date = date.add({ days: 1 })
    ) {
      const value = date.toString()
      if (
        value < start.toPlainDate().toString() ||
        value > event.recurrence.until ||
        !event.recurrence.days.includes(date.dayOfWeek)
      )
        continue
      try {
        out.push({
          ...event,
          id: `${event.id}@${value}`,
          start: localInstant(value, start.toPlainTime().toString(), event.timeZone),
          end: localInstant(value, end.toPlainTime().toString(), event.timeZone),
          recurrence: null,
        })
      } catch {
        /* A nonexistent/ambiguous DST wall time is not guessed. */
      }
      if (out.length > 2000)
        throw new Error('Too many calendar occurrences; narrow the date range.')
    }
  }
  return out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
}
/** Reject corrupt/unsupported local records before they can crash calendar rendering.
 * Never rewrite the underlying database as a side effect of reading it.
 */
export function validateStoredSchedule(value: unknown): CalendarEvent[] {
  if (!Array.isArray(value) || value.length > 2000)
    throw new Error(
      'Local schedule data is not valid. It has not been overwritten; clear it explicitly or restore a valid export.',
    )
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid local calendar record.')
    const event = raw as CalendarEvent
    if (
      !['manual', 'ics', 'google', 'microsoft', 'screenshot'].includes(event.source) ||
      !['class', 'other', 'unclassified'].includes(event.category) ||
      !event.id ||
      typeof event.title !== 'string' ||
      typeof event.location !== 'string'
    )
      throw new Error('Unsupported local calendar record. Nothing has been overwritten.')
    inZone(event.start, event.timeZone)
    inZone(event.end, event.timeZone)
    if (Date.parse(event.end) <= Date.parse(event.start))
      throw new Error('Invalid local event times. Nothing has been overwritten.')
    if (
      event.recurrence &&
      (!Array.isArray(event.recurrence.days) ||
        event.recurrence.days.some((day) => !Number.isInteger(day) || day < 1 || day > 7) ||
        !Temporal.PlainDate.from(event.recurrence.until))
    )
      throw new Error('Invalid local recurrence.')
  }
  return value as CalendarEvent[]
}
export function duplicateKey(e: CalendarEvent) {
  return JSON.stringify([
    e.title.toLowerCase().trim(),
    e.start,
    e.end,
    e.location.toLowerCase().trim(),
    e.recurrence,
  ])
}
export function mergeEvents(current: CalendarEvent[], incoming: CalendarEvent[]) {
  const keys = new Set(current.map(duplicateKey)),
    ids = new Set(current.map((e) => e.id))
  const added = incoming.filter((e) => {
    const key = duplicateKey(e)
    if (keys.has(key) || ids.has(e.id)) return false
    keys.add(key)
    ids.add(e.id)
    return true
  })
  if (current.length + added.length > 2000)
    throw new Error('Local schedule limit is 2,000 events. Clear older events first.')
  return [...current, ...added]
}
export function overlaps(events: CalendarEvent[]) {
  const sorted = [...events]
    .filter((e) => !e.allDay)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  return sorted.some((e, i) =>
    sorted.slice(i + 1).some((next) => Date.parse(next.start) < Date.parse(e.end)),
  )
}
export function sampleSchedule(): CalendarEvent[] {
  return [
    manualEvent({
      title: 'Sample seminar',
      section: 'Demo',
      date: '2026-10-19',
      until: '',
      start: '12:00',
      end: '13:00',
      days: [],
      location: 'Leavey Library',
      buildingCode: 'LVL',
      room: '',
      notes: 'DEMO ONLY — not a real class.',
      category: 'class',
    }),
    manualEvent({
      title: 'Sample workshop',
      section: 'Demo',
      date: '2026-10-19',
      until: '',
      start: '13:15',
      end: '14:15',
      days: [],
      location: 'Tutor Campus Center',
      buildingCode: 'TCC',
      room: '',
      notes: 'DEMO ONLY — not a real class.',
      category: 'class',
    }),
  ]
}
