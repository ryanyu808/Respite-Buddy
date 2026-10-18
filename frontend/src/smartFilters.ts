import { Temporal } from '@js-temporal/polyfill'
import type { Spot } from './respite'
export const FILTER_LABELS = {
  quiet: 'Quiet',
  outlets: 'Need an outlet',
  comfortable_seating: 'Comfortable seating',
  few_people: 'Few people',
  dim: 'Dim lighting',
  indoor: 'Indoor',
  outdoor: 'Outdoor',
  restroom: 'Restroom nearby',
  food_allowed: 'Food allowed',
  food_available: 'Food available for purchase',
  step_free: 'Step-free access',
  open_now: 'Open now',
  no_reservation: 'No reservation needed',
  verified_only: 'Scout verified only',
  evening_access: 'Confirmed evening access',
} as const
export type FilterKey = keyof typeof FILTER_LABELS
export type SmartFilters = Record<FilterKey, boolean> & {
  max_walk_min: number | null
  access: 'any' | 'open' | 'usc_id'
  activity: 'break' | 'study' | 'charge' | 'eat' | 'between' | 'friend'
}
export const DEFAULT_FILTERS: SmartFilters = {
  ...Object.fromEntries(Object.keys(FILTER_LABELS).map((k) => [k, false])),
  max_walk_min: null,
  access: 'any',
  activity: 'break',
} as SmartFilters
export const FILTERS_KEY = 'respite-buddy-smart-filters'
export function validFilters(raw: unknown): SmartFilters {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid filters')
  const value = raw as Record<string, unknown>,
    result = { ...DEFAULT_FILTERS }
  if (Object.keys(value).some((key) => !Object.hasOwn(DEFAULT_FILTERS, key)))
    throw new Error('Unrecognized filter')
  for (const key of Object.keys(FILTER_LABELS) as FilterKey[])
    if (key in value) {
      if (typeof value[key] !== 'boolean') throw new Error('Invalid filter')
      result[key] = value[key] as boolean
    }
  if (value.max_walk_min !== undefined && value.max_walk_min !== null) {
    if (
      !Number.isInteger(value.max_walk_min) ||
      Number(value.max_walk_min) < 1 ||
      Number(value.max_walk_min) > 120
    )
      throw new Error('Invalid walking limit')
    result.max_walk_min = Number(value.max_walk_min)
  }
  if (value.access !== undefined) {
    if (!['any', 'open', 'usc_id'].includes(String(value.access))) throw new Error('Invalid access')
    result.access = value.access as SmartFilters['access']
  }
  if (value.activity !== undefined) {
    if (!['break', 'study', 'charge', 'eat', 'between', 'friend'].includes(String(value.activity)))
      throw new Error('Invalid activity')
    result.activity = value.activity as SmartFilters['activity']
  }
  if (result.indoor && result.outdoor) throw new Error('Conflicting setting filters')
  return result
}
export function loadFilters(): SmartFilters {
  try {
    return validFilters(JSON.parse(localStorage.getItem(FILTERS_KEY) || '{}'))
  } catch {
    return { ...DEFAULT_FILTERS }
  }
}
export function saveFilters(filters: SmartFilters) {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters))
  } catch {
    /* Optional device storage. */
  }
}
export const hasFilters = (filters: SmartFilters) =>
  JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS)
export type DirectorySpot = Spot & {
  provenance?: { url: string; checked: string; supports: string[]; source_type: string }[]
  amenities?: string[]
  routing_anchor?: string
  anchor_source?: string
  walk_min?: number | null
}
export function isScouted(spot: Spot) {
  return spot.data_kind === 'scouted' && Boolean(spot.verified_by && spot.verified_date)
}
export function knownAttribute(spot: DirectorySpot, field: keyof Spot) {
  return (
    spot[field] != null &&
    Boolean(
      isScouted(spot) ||
      spot.evidence?.[field] ||
      spot.provenance?.some(
        (p) => p.source_type !== 'USC historical article' && p.supports.includes(field),
      ),
    )
  )
}
export function attributeState(
  spot: DirectorySpot,
  field: keyof Spot,
  positive: unknown = true,
): 'present' | 'absent' | 'unknown' {
  return !knownAttribute(spot, field) ? 'unknown' : spot[field] === positive ? 'present' : 'absent'
}
export function openNow(spot: Spot, now: string): boolean {
  if (!spot.hours) return false
  const at = Temporal.Instant.from(now).toZonedDateTimeISO('America/Los_Angeles')
  const names = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  for (const offset of [-1, 0]) {
    const date = at.toPlainDate().add({ days: offset })
    for (const interval of spot.hours[names[date.dayOfWeek - 1]] ?? []) {
      const start = Temporal.PlainDateTime.from(`${date}T${interval.start}`).toZonedDateTime(
        'America/Los_Angeles',
      )
      const endDate = interval.end <= interval.start ? date.add({ days: 1 }) : date
      const end = Temporal.PlainDateTime.from(`${endDate}T${interval.end}`).toZonedDateTime(
        'America/Los_Angeles',
      )
      if (
        at.epochMilliseconds >= start.epochMilliseconds &&
        at.epochMilliseconds < end.epochMilliseconds
      )
        return true
    }
  }
  return false
}
export function matchesFilters(
  spot: DirectorySpot,
  f: SmartFilters,
  at: string,
  walk?: number | null,
): boolean {
  const yes = (field: keyof Spot, value: unknown = true) =>
    attributeState(spot, field, value) === 'present'
  const checks: Record<FilterKey, boolean> = {
    quiet: yes('noise', 'low'),
    outlets: yes('outlets'),
    comfortable_seating: yes('seating', 'soft'),
    few_people: isScouted(spot) && yes('typical_crowd', 'few'),
    dim: yes('lighting', 'dim'),
    indoor: yes('indoor'),
    outdoor: yes('indoor', false),
    restroom: yes('restroom_nearby'),
    food_allowed: yes('food_allowed'),
    food_available: yes('food_available'),
    step_free: yes('step_free'),
    open_now: knownAttribute(spot, 'hours') && openNow(spot, at),
    no_reservation: yes('reservation_required', false),
    verified_only: isScouted(spot),
    evening_access:
      yes('safe_after_dark') &&
      knownAttribute(spot, 'hours') &&
      openNow(spot, at) &&
      knownAttribute(spot, 'access') &&
      ['open', 'usc_id'].includes(spot.access ?? ''),
  }
  if ((Object.keys(checks) as FilterKey[]).some((key) => f[key] && !checks[key])) return false
  if (f.access !== 'any' && !yes('access', f.access)) return false
  if (f.activity === 'charge' && !yes('outlets')) return false
  if (f.activity === 'eat' && !yes('food_available') && !yes('food_allowed')) return false
  return f.max_walk_min == null || (walk != null && walk <= f.max_walk_min)
}
