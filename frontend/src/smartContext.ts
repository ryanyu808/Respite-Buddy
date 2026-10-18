import { inZone, occurrences, type CalendarEvent } from './calendar/model'
import { FALLBACK } from './data/fallback'
import type { Point } from './types'
const LAST_PLACE = 'respite-buddy-last-campus-location'
export function rememberedCampus() {
  try {
    const value = localStorage.getItem(LAST_PLACE)
    return FALLBACK.buildings.find((b) => b.name === value)?.name ?? null
  } catch {
    return null
  }
}
export function rememberCampus(value: string | Point) {
  // Never persist GPS/precise coordinates, only an explicitly selected known building.
  if (typeof value !== 'string') {
    const known = FALLBACK.buildings.find(
      (b) => b.name === value.name && b.lat === value.lat && b.lon === value.lon,
    )
    if (known) rememberCampus(known.name)
    return
  }
  const target = FALLBACK.buildings.find((b) =>
    [b.name, b.id, ...(b.aliases ?? [])].some(
      (a) => a.toLowerCase() === value.trim().toLowerCase(),
    ),
  )
  if (target)
    try {
      localStorage.setItem(LAST_PLACE, target.name)
    } catch {
      /* Optional. */
    }
}
export function clearRememberedCampus() {
  try {
    localStorage.removeItem(LAST_PLACE)
  } catch {
    /* Optional. */
  }
}
export function scheduleContext(events: CalendarEvent[], now = new Date().toISOString()) {
  const date = inZone(now).toPlainDate().toString(),
    at = Date.parse(now)
  const classes = occurrences(events, date, date).filter((e) => e.category === 'class' && !e.allDay)
  if (
    classes.some((entry, i) =>
      classes.slice(i + 1).some((next) => Date.parse(next.start) < Date.parse(entry.end)),
    )
  )
    return null
  // A class in progress cannot establish the user's position or free time.
  if (classes.some((e) => Date.parse(e.start) <= at && at < Date.parse(e.end))) return null
  const next = classes.find((e) => Date.parse(e.start) > at)
  if (!next || (!next.buildingCode && !next.location)) return null
  const minutes = Math.floor((Date.parse(next.start) - at) / 60000)
  if (minutes < 1 || minutes > 240) return null
  return { next_class: next.buildingCode || next.location, minutes, deadline: next.start }
}
export function contextualSuggestion(now: string, context: ReturnType<typeof scheduleContext>) {
  if (context)
    return {
      id: `between-${context.deadline}`,
      text: `You have ${context.minutes} minutes before your next class.`,
      action: 'Use this class break',
      kind: 'between' as const,
    }
  const hour = inZone(now).hour
  if (hour >= 19 || hour < 7)
    return {
      id: 'evening',
      text: 'Evening access can vary.',
      action: 'Show confirmed evening access',
      kind: 'evening' as const,
    }
  if (hour >= 11 && hour < 14)
    return {
      id: 'lunch',
      text: 'Looking for somewhere to eat?',
      action: 'Explore food options',
      kind: 'lunch' as const,
    }
  return null
}
