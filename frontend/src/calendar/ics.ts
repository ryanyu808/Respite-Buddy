import ICAL from 'ical.js'
import { Temporal } from '@js-temporal/polyfill'
import { ZONE, localInstant, mergeEvents, type CalendarEvent } from './model'

export type ImportPreview = { events: CalendarEvent[]; warnings: string[] }
const MAX_BYTES = 2 * 1024 * 1024
const value = (c: ICAL.Component, key: string) => String(c.getFirstPropertyValue(key) ?? '')
function zoneName(c: ICAL.Component, key: string) {
  const tz = c.getFirstProperty(key)?.getParameter('tzid')
  return String(tz || ZONE).replace(/^Pacific Standard Time$/, ZONE)
}
function instant(t: ICAL.Time, zone: string) {
  if (t.zone === ICAL.Timezone.utcTimezone) return t.toJSDate().toISOString()
  const date = `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`
  const time = `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}:${String(t.second).padStart(2, '0')}`
  // Prefer the IANA database for DST even when exports omit VTIMEZONE.
  try {
    return localInstant(date, time, zone)
  } catch (error) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone })
    } catch {
      if (t.zone !== ICAL.Timezone.localTimezone) return t.toJSDate().toISOString()
    }
    throw error
  }
}
export function parseICS(text: string, from: string, through: string): ImportPreview {
  if (new TextEncoder().encode(text).length > MAX_BYTES)
    throw new Error('Calendar file must be 2 MB or smaller.')
  const startBound = Temporal.PlainDate.from(from),
    endBound = Temporal.PlainDate.from(through)
  if (startBound.until(endBound).days < 0 || startBound.until(endBound).days > 120)
    throw new Error('Import a date range of at most 120 days.')
  if (!/^BEGIN:VCALENDAR\s*$/m.test(text)) throw new Error('Choose a valid .ics calendar export.')
  const root = new ICAL.Component(ICAL.parse(text)),
    warnings: string[] = [],
    events: CalendarEvent[] = []
  const components = root.getAllSubcomponents('vevent')
  if (components.length > 500)
    throw new Error('Calendar has more than 500 event definitions. Export a smaller calendar.')
  ICAL.TimezoneService.reset()
  try {
    for (const tz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz)
    let iterations = 0
    for (const component of components) {
      if (component.hasProperty('recurrence-id')) continue
      if (value(component, 'status').toUpperCase() === 'CANCELLED') continue
      try {
        if (!component.hasProperty('dtstart')) throw new Error('Missing start time')
        const rule = value(component, 'rrule')
        if (/FREQ=(SECONDLY|MINUTELY|HOURLY)/i.test(rule))
          throw new Error(
            'High-frequency recurrence is not supported; export daily or weekly events',
          )
        if (component.getAllProperties('rdate').some((p) => p.type === 'period'))
          throw new Error('Period-valued RDATE requires manual entry')
        const event = new ICAL.Event(component),
          tz =
            event.startDate.zone === ICAL.Timezone.utcTimezone
              ? 'UTC'
              : zoneName(component, 'dtstart')
        const uid = value(component, 'uid') || `no-uid-${components.indexOf(component)}`
        const cancelled = components.filter(
          (c) =>
            value(c, 'uid') === uid &&
            value(c, 'status').toUpperCase() === 'CANCELLED' &&
            c.hasProperty('recurrence-id'),
        )
        const iterator = event.iterator()
        if (
          !component.getFirstProperty('dtstart')?.getParameter('tzid') &&
          event.startDate.zone === ICAL.Timezone.localTimezone &&
          !event.startDate.isDate
        )
          warnings.push(
            'Floating event times are interpreted in America/Los_Angeles; check them in review.',
          )
        let time: ICAL.Time | null
        while ((time = iterator.next())) {
          if (++iterations > 10000 || events.length >= 2000)
            throw new Error('Expansion limit reached; use a smaller export or date range')
          // Cancelled recurrence exceptions may legally omit DTSTART/DTEND.
          // Check their recurrence ID before ICAL tries to read their duration.
          if (
            cancelled.some((c) => {
              const rid = c.getFirstPropertyValue('recurrence-id') as ICAL.Time
              const same =
                rid.toString() === time!.toString() ||
                rid.convertToZone(ICAL.Timezone.utcTimezone).toString() ===
                  time!.convertToZone(ICAL.Timezone.utcTimezone).toString()
              return (
                same ||
                (c.getFirstProperty('recurrence-id')?.getParameter('range') === 'THISANDFUTURE' &&
                  time!.compare(rid) >= 0)
              )
            })
          )
            continue
          const occurrence = event.getOccurrenceDetails(time),
            item = occurrence.item.component
          const start = instant(occurrence.startDate, zoneName(item, 'dtstart') || tz)
          const end = instant(occurrence.endDate, zoneName(item, 'dtend') || tz)
          const date = Temporal.Instant.from(start)
            .toZonedDateTimeISO(ZONE)
            .toPlainDate()
            .toString()
          if (date > through) break
          if (date < from || value(item, 'status').toUpperCase() === 'CANCELLED') continue
          if (Date.parse(end) <= Date.parse(start)) throw new Error('Missing or invalid end time')
          events.push({
            id: `ics:${encodeURIComponent(uid).slice(0, 140)}:${start}`,
            source: 'ics',
            sourceEventId: uid.slice(0, 500),
            title: value(item, 'summary').slice(0, 300) || 'Untitled event',
            start,
            end,
            timeZone: (() => {
              try {
                new Intl.DateTimeFormat('en', { timeZone: tz })
                return tz
              } catch {
                return ZONE
              }
            })(),
            location: value(item, 'location').slice(0, 160),
            buildingCode: '',
            category: 'unclassified',
            room: '',
            section: '',
            notes: rule
              ? `Expanded recurrence: ${rule.slice(0, 300)}. Re-import to update future occurrences.`
              : '',
            allDay: occurrence.startDate.isDate,
            recurrence: null,
          })
          if (!event.isRecurring()) break
        }
      } catch (error) {
        warnings.push(
          `An event was skipped or truncated: ${error instanceof Error ? error.message : 'unsupported calendar data'}. Review and add missing entries manually.`,
        )
      }
      if (iterations > 10000 || events.length >= 2000) break
    }
  } finally {
    ICAL.TimezoneService.reset()
  }
  return { events: mergeEvents([], events), warnings: [...new Set(warnings)] }
}
