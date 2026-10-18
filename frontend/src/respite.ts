import type { Location, Point, Preferences, Route, RouteResponse } from './types'
import { isPreferences } from './preferences'

export const NEEDS = [
  { id: 'quiet', label: 'Quiet' },
  { id: 'seated', label: 'Seated' },
  { id: 'dim', label: 'Dim light' },
  { id: 'few_people', label: 'Few people' },
  { id: 'indoor', label: 'Indoor' },
  { id: 'outdoor', label: 'Outdoor' },
] as const
export type Need = (typeof NEEDS)[number]['id']
export const TIME_CHIPS = [5, 10, 12, 15, 20]
export const DEMO_TIME = '2026-10-19T13:00:00-07:00'
export const SETTINGS_KEY = 'respite-buddy-preferences'
export type DevicePreferences = {
  minutes: number
  needs: Need[]
  highContrast: boolean
  lowSensory: boolean
}
export const DEVICE_DEFAULTS: DevicePreferences = {
  minutes: 15,
  needs: [],
  highContrast: false,
  lowSensory: false,
}
export type Exclusion = { spot_id: string; until: string }
export type ResetRequest = {
  near: string | Point
  next_class: string | Point | null
  minutes: number
  needs: Need[]
  demo: boolean
  now?: string
  deadline?: string
  demo_time?: string
  usc_id: boolean
  preferences?: Preferences
  exclusions?: Exclusion[]
}
export type Spot = {
  id: string
  name: string
  building: string | null
  building_code: string | null
  floor: string | number | null
  lat: number
  lng: number
  photo_url: string | null
  indoor: boolean | null
  hours: Record<string, { start: string; end: string }[]> | null
  access: 'open' | 'usc_id' | 'restricted' | null
  access_note: string | null
  lighting: 'bright' | 'medium' | 'dim' | null
  noise: 'low' | 'medium' | 'high' | null
  seating: 'none' | 'hard' | 'soft' | null
  typical_crowd: 'few' | 'some' | 'many' | null
  outlets: boolean | null
  food_allowed: boolean | null
  restroom_nearby: boolean | null
  step_free: boolean | null
  safe_after_dark: boolean | null
  verified_by: string | null
  verified_date: string | null
  notes: string | null
  data_kind: 'scouted' | 'mapped' | 'illustrative'
  source_url: string | null
}
export type Recommendation = {
  spot: Spot
  why: string[]
  walk_to_min: number
  walk_to_class_min: number | null
  rest_min: number
  leave_by: string
  tight_on_time: boolean
  route_to_spot: RouteResponse | null
  route_to_class: RouteResponse | null
  backup_id: string | null
  deep_link: string
  crowd: {
    category: 'few' | 'some' | 'many' | null
    source: string | null
    observed_at: string | null
  }
}
export type ResetResponse = {
  mode: 'live' | 'demo'
  evaluated_at: string
  deadline: string
  minutes: number
  origin: Point
  next_class: Point | null
  recommendations: Recommendation[]
  notes: string[]
  exclusions: Exclusion[]
}
export type ResetResult = { response: ResetResponse; saved: boolean }

const isNeed = (value: unknown): value is Need => NEEDS.some((need) => need.id === value)
const validMinutes = (value: number) => Number.isInteger(value) && value >= 1 && value <= 180
export function loadDevicePreferences(): DevicePreferences {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')
    if (
      !value ||
      !validMinutes(value.minutes) ||
      !Array.isArray(value.needs) ||
      !value.needs.every(isNeed)
    )
      return { ...DEVICE_DEFAULTS }
    return {
      minutes: value.minutes,
      needs: [...new Set<Need>(value.needs)],
      highContrast: value.highContrast === true,
      lowSensory: value.lowSensory === true,
    }
  } catch {
    return { ...DEVICE_DEFAULTS }
  }
}
export function saveDevicePreferences(value: DevicePreferences) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(value))
  } catch {
    /* Storage is optional. */
  }
}
export function activeExclusions(exclusions: Exclusion[], now = Date.now()) {
  return exclusions.filter(
    (item) => typeof item.spot_id === 'string' && Date.parse(item.until) > now,
  )
}
export function loadExclusions(): Exclusion[] {
  try {
    const value = JSON.parse(sessionStorage.getItem('respite-buddy-exclusions') || '[]')
    return Array.isArray(value)
      ? activeExclusions(value.filter((item) => item && typeof item.until === 'string'))
      : []
  } catch {
    return []
  }
}
export function saveExclusions(exclusions: Exclusion[]) {
  try {
    sessionStorage.setItem('respite-buddy-exclusions', JSON.stringify(exclusions))
  } catch {
    /* Optional session storage. */
  }
}

export function parseDeepLink(
  search: string,
  hash = typeof window === 'undefined' ? '' : window.location.hash,
) {
  const params = new URLSearchParams(search)
  const notices: string[] = []
  const context: {
    deadline?: string
    usc_id?: boolean
    preferences?: Preferences
    demo_time?: string
  } = {}
  if (hash.startsWith('#reset=')) {
    try {
      if (hash.length > 6000) throw new Error('Context too long')
      const value = JSON.parse(decodeURIComponent(hash.slice(7)))
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid context')
      const isDate = (date: unknown): date is string =>
        typeof date === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(date) &&
        Number.isFinite(Date.parse(date))
      if (value.deadline !== undefined) {
        if (!isDate(value.deadline)) throw new Error('Invalid deadline')
        context.deadline = value.deadline
      }
      if (value.demo_time !== undefined) {
        if (!isDate(value.demo_time)) throw new Error('Invalid demo time')
        context.demo_time = value.demo_time
      }
      if (value.usc_id !== undefined) {
        if (typeof value.usc_id !== 'boolean') throw new Error('Invalid access eligibility')
        context.usc_id = value.usc_id
      }
      if (value.preferences !== undefined) {
        if (!isPreferences(value.preferences)) throw new Error('Invalid preferences')
        const { noise, crowds, traffic, green, pace, max_detour } = value.preferences
        context.preferences = { noise, crowds, traffic, green, pace, max_detour }
      }
    } catch {
      Object.keys(context).forEach((key) => delete context[key as keyof typeof context])
      notices.push(
        'The linked navigation context is invalid. Using your saved preferences and a fresh time budget.',
      )
    }
  }
  function place(key: string): string | Point | null {
    const value = params.get(key)?.trim()
    if (!value) return null
    if (value.includes(',')) {
      const pieces = value.split(',')
      const [lat, lon] = pieces.map(Number)
      if (
        pieces.length === 2 &&
        pieces.every((p) => p.trim() !== '') &&
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lon) <= 180
      )
        return { lat, lon, name: key === 'from' ? 'Linked starting point' : 'Linked next class' }
    } else if (value.length <= 120 && !/[\u0000-\u001f<>]/.test(value)) return value
    notices.push(
      `The linked ${key === 'from' ? 'starting point' : 'next class'} is invalid. Choose a campus building instead.`,
    )
    return null
  }
  const minutesValue = params.get('minutes')
  const minutes =
    minutesValue !== null && validMinutes(Number(minutesValue)) ? Number(minutesValue) : undefined
  if (minutesValue !== null && minutes === undefined)
    notices.push('The linked time is invalid. Using your saved time or 15 minutes.')
  const rawNeeds = params
    .get('needs')
    ?.split(',')
    .map((n) => n.trim())
    .filter(Boolean)
  if (rawNeeds?.some((n) => !isNeed(n)))
    notices.push('Some linked needs were not recognized and were skipped.')
  const rawTo = params.get('to')
  const to = rawTo && /^[a-zA-Z0-9_.:-]{1,120}$/.test(rawTo) ? rawTo : null
  if (rawTo && !to) notices.push('The linked spot is invalid. Showing eligible places instead.')
  return {
    near: place('from'),
    next: place('next'),
    minutes,
    needs: rawNeeds ? [...new Set(rawNeeds.filter(isNeed))] : undefined,
    to,
    demo: ['true', '1'].includes(params.get('demo') ?? ''),
    auto:
      ['to', 'from', 'next', 'minutes', 'needs', 'demo'].some((key) => params.has(key)) ||
      hash.startsWith('#reset='),
    notices,
    ...context,
  }
}
export function resolveBuilding(value: string | Point, buildings: Location[]): string | Point {
  if (typeof value !== 'string') return value
  const building = buildings.find(
    (building) =>
      building.name.toLowerCase() === value.toLowerCase() ||
      building.id.toLowerCase() === value.toLowerCase() ||
      building.aliases?.some((alias) => alias.toLowerCase() === value.toLowerCase()),
  )
  return building ? { lat: building.lat, lon: building.lon, name: building.name } : value
}
export function timeLabel(value: string) {
  if (!Number.isFinite(Date.parse(value))) return 'Unavailable'
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
  }).format(new Date(value))
}
export function crowdLabel(crowd: Recommendation['crowd'], evaluatedAt: string) {
  const source = ['Verified by scouts', 'Estimate', 'Reported'].find(
    (label) => label.toLowerCase() === crowd.source?.toLowerCase(),
  )
  const observed = Date.parse(crowd.observed_at ?? '')
  const evaluated = Date.parse(evaluatedAt)
  if (
    !crowd.category ||
    !source ||
    !Number.isFinite(observed) ||
    !Number.isFinite(evaluated) ||
    observed > evaluated
  )
    return 'Crowd information unavailable.'
  if (/^\d{4}-\d{2}-\d{2}$/.test(crowd.observed_at ?? ''))
    return `Typical: ${{ few: 'Few people', some: 'Some people', many: 'Many people' }[crowd.category]} · ${source} · visited ${crowd.observed_at} (time unknown)`
  const age = Math.floor((evaluated - observed) / 60000)
  const ageText =
    age < 1
      ? 'at evaluation time'
      : age < 60
        ? `${age} min before evaluation`
        : `${Math.floor(age / 60)} hr before evaluation`
  return `${{ few: 'Few people', some: 'Some people', many: 'Many people' }[crowd.category]} · ${source} · ${ageText}`
}
export function routeDescription(route: Route, fastest?: Route) {
  const parts = [
    `About ${Math.ceil(route.duration_min)} minutes on mapped walking paths.`,
    `${Math.round(route.major_road_m)} m on mapped major-road segments.`,
  ]
  if (fastest && fastest.id !== route.id) {
    const avoided = Math.round(fastest.major_road_m - route.major_road_m)
    if (avoided > 0) parts.push(`${avoided} m less on major-road segments than the fastest route.`)
    if (route.extra_minutes > 0)
      parts.push(`About ${Math.ceil(route.extra_minutes)} extra walking minutes.`)
  }
  return parts.join(' ')
}
