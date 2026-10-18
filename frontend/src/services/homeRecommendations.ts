import data from '../data/demo-route-legs.json'
import { DEFAULTS } from '../preferences'
import {
  DEMO_TIME,
  type Recommendation,
  type ResetRequest,
  type ResetResponse,
  type Spot,
} from '../respite'
import { inZone, localInstant } from '../calendar/model'
import { campusJourneySeed, resolveDemoLocation } from './demoJourney'

const spots = (data as unknown as { spots: Spot[] }).spots
const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function closingAt(spot: Spot, clock: string) {
  const at = inZone(clock),
    day = at.toPlainDate().toString()
  for (const hours of spot.hours?.[weekdays[at.dayOfWeek - 1]] ?? []) {
    const open = Date.parse(localInstant(day, hours.start))
    const close = Date.parse(localInstant(day, hours.end))
    if (open <= Date.parse(clock) && Date.parse(clock) < close) return close
  }
  return null
}

/** Demo editorial ranking, not measured occupancy or a change to the routing engine. */
export function timeFit(item: Recommendation, minutes: number) {
  const targetWalk = minutes <= 20 ? 0 : minutes <= 45 ? 6 : 10
  const walking = item.walk_to_min + (item.walk_to_class_min ?? 0)
  return (
    Math.abs(item.walk_to_min - targetWalk) * 2 +
    walking * 0.25 +
    Math.max(0, Math.min(10, minutes / 2) - item.rest_min) * 4
  )
}

/** Rank the full sample library before selecting cards; never recycle a pre-truncated top three. */
export function homeRecommendations(request: ResetRequest): ResetResponse | null {
  if (!request.demo || request.now || request.usc_id) return null
  if (!Number.isInteger(request.minutes) || request.minutes < 1 || request.minutes > 240)
    return null
  const origin = resolveDemoLocation(request.near)
  const next = request.next_class === null ? null : resolveDemoLocation(request.next_class)
  if (!origin || next === undefined) return null
  const clock = request.demo_time ?? DEMO_TIME,
    at = Date.parse(clock)
  if (!Number.isFinite(at)) return null
  try {
    inZone(clock)
  } catch {
    return null
  }
  if (
    Object.keys(DEFAULTS).some(
      (key) =>
        request.preferences &&
        request.preferences[key as keyof typeof DEFAULTS] !==
          DEFAULTS[key as keyof typeof DEFAULTS],
    )
  )
    return null
  const deadline = Math.min(
    at + request.minutes * 60000,
    Date.parse(request.deadline ?? new Date(at + request.minutes * 60000).toISOString()),
  )
  if (!Number.isFinite(at) || !Number.isFinite(deadline)) return null
  const minutes = Math.max(0, Math.floor((deadline - at) / 60000))
  const eligible = spots.filter((spot) => {
    const matches = {
      indoor: spot.indoor === true,
      outdoor: spot.indoor === false,
      quiet: spot.noise === 'low',
      seated: spot.seating === 'hard' || spot.seating === 'soft',
      dim: spot.lighting === 'dim',
      few_people: spot.typical_crowd === 'few',
    }
    return (
      spot.data_kind === 'illustrative' &&
      spot.purpose === 'general' &&
      spot.reservation_required !== true &&
      (request.needs.includes('indoor') ? spot.indoor : !spot.indoor) &&
      request.needs.every((need) => matches[need])
    )
  })
  const base: ResetResponse = {
    mode: 'demo',
    evaluated_at: clock,
    deadline: new Date(deadline).toISOString(),
    minutes,
    origin,
    next_class: next ?? null,
    notes: [
      'Sample conditions, not verified observations. Walking estimates exclude indoor travel.',
    ],
    exclusions: [],
    recommendations: eligible.map((spot) => ({
      spot,
      why: [],
      walk_to_min: 0,
      walk_to_class_min: null,
      rest_min: 0,
      leave_by: '',
      tight_on_time: false,
      route_to_spot: null,
      route_to_class: null,
      backup_id: null,
      deep_link: 'https://respite-buddy.vercel.app/',
      crowd: { category: null, source: null, observed_at: null },
    })),
  }
  const journey = campusJourneySeed(request, base)
  if (!journey) return null
  const recommendations = journey.recommendations
    .flatMap((item) => {
      const closing = closingAt(item.spot, clock)
      if (closing === null || inZone(clock).hour < 7 || inZone(clock).hour >= 19) return []
      const leave = Math.min(deadline - (item.walk_to_class_min ?? 0) * 60000, closing)
      const rest = Math.floor((leave - at) / 60000) - item.walk_to_min
      if (
        rest <= 0 ||
        request.exclusions?.some(
          (e) => e.spot_id === item.spot.id && Date.parse(e.until) > Date.now(),
        )
      )
        return []
      const link = new URL(item.deep_link)
      link.searchParams.set('to', item.spot.id)
      link.searchParams.set('minutes', String(request.minutes))
      link.searchParams.set('needs', request.needs.join(','))
      link.searchParams.set('demo', '1')
      link.searchParams.set('home', '1')
      link.hash = `reset=${encodeURIComponent(JSON.stringify({ deadline: new Date(deadline).toISOString(), demo_time: clock, usc_id: false, preferences: DEFAULTS }))}`
      return [
        {
          ...item,
          rest_min: rest,
          leave_by: new Date(leave).toISOString(),
          tight_on_time: rest <= 3,
          why: [
            minutes <= 20
              ? 'A nearby option for a short break.'
              : 'Your time window allows a change of scenery.',
            'Sample conditions, not verified observations.',
          ],
          deep_link: link.toString(),
        },
      ]
    })
    .sort(
      (a, b) =>
        timeFit(a, minutes) - timeFit(b, minutes) ||
        b.rest_min - a.rest_min ||
        a.spot.id.localeCompare(b.spot.id),
    )
  return {
    ...journey,
    recommendations: recommendations.map((item) => ({
      ...item,
      backup_id: recommendations.find((other) => other.spot.id !== item.spot.id)?.spot.id ?? null,
    })),
  }
}
