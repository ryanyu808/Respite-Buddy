import { api } from './api'
import { DEFAULTS } from '../preferences'
import {
  activeExclusions,
  DEMO_TIME,
  type ResetRequest,
  type ResetResponse,
  type ResetResult,
} from '../respite'
import { FALLBACK } from '../data/fallback'

type DemoBundle = {
  request: ResetRequest
  response: ResetResponse
  scenarios?: { request: ResetRequest; response: ResetResponse }[]
}
// The shared-data owner generates this file. A missing bundle leaves a useful error state.
const bundles = import.meta.glob<DemoBundle>('../data/respite-demo.json', {
  eager: true,
  import: 'default',
})
function sameRequest(a: ResetRequest, b: ResetRequest, response: ResetResponse) {
  const normalizedPlace = (
    value: ResetRequest['near'] | null,
    resolved: ResetResponse['origin'] | null,
  ) => {
    if (value === null) return null
    const places = [
      ...FALLBACK.locations,
      ...(('buildings' in FALLBACK ? FALLBACK.buildings : []) as typeof FALLBACK.locations),
    ]
    if (typeof value === 'string') {
      const name = value.trim().toLowerCase()
      const building = places.find((place) =>
        [place.id, place.name, ...(place.aliases ?? [])].some(
          (alias) => alias.toLowerCase() === name,
        ),
      )
      if (building) return `${building.lat.toFixed(7)},${building.lon.toFixed(7)}`
      // The engine's default Leavey alias resolves to the response origin.
      if (
        resolved &&
        ['leavey', 'leavey library', 'lvl'].includes(name) &&
        resolved.name.toLowerCase().includes('leavey')
      )
        return `${resolved.lat.toFixed(7)},${resolved.lon.toFixed(7)}`
      return name
    }
    return `${value.lat.toFixed(7)},${value.lon.toFixed(7)}`
  }
  const prefs = (value: ResetRequest) =>
    JSON.stringify(
      Object.entries(value.preferences ?? DEFAULTS).sort(([a], [b]) => a.localeCompare(b)),
    )
  return (
    a.demo &&
    b.demo &&
    normalizedPlace(a.near, response.origin) === normalizedPlace(b.near, response.origin) &&
    normalizedPlace(a.next_class, response.next_class) ===
      normalizedPlace(b.next_class, response.next_class) &&
    a.minutes === b.minutes &&
    [...a.needs].sort().join(',') === [...b.needs].sort().join(',') &&
    a.usc_id === b.usc_id &&
    prefs(a) === prefs(b) &&
    Date.parse(a.demo_time ?? DEMO_TIME) === Date.parse(b.demo_time ?? DEMO_TIME) &&
    (!a.deadline ||
      Math.min(Date.parse(a.deadline), Date.parse(a.demo_time ?? DEMO_TIME) + a.minutes * 60000) ===
        Date.parse(response.deadline)) &&
    !a.now
  )
}

export function savedDemo(request: ResetRequest): ResetResult | null {
  const bundle = Object.values(bundles)[0]
  if (!bundle) return null
  const scenario = [
    { request: bundle.request, response: bundle.response },
    ...(bundle.scenarios ?? []),
  ].find((item) => sameRequest(request, item.request, item.response))
  if (!scenario) return null
  const exclusions = activeExclusions(request.exclusions ?? [])
  const recommendations = scenario.response.recommendations.filter(
    (item) => !exclusions.some((exclusion) => exclusion.spot_id === item.spot.id),
  )
  return {
    saved: true,
    response: {
      ...scenario.response,
      exclusions,
      recommendations: recommendations.map((item) => ({
        ...item,
        backup_id: recommendations.find((other) => other.spot.id !== item.spot.id)?.spot.id ?? null,
      })),
    },
  }
}
function connectionFailure(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof Error &&
      (error.name === 'OfflineError' ||
        /isn't loading|unable to reach|took too long|failed to fetch/i.test(error.message)))
  )
}
export async function findResetSpots(request: ResetRequest): Promise<ResetResult> {
  const replay = savedDemo(request)
  if (replay) return replay
  try {
    const response = await api<ResetResponse>('/reset-spots', engineRequest(request))
    if (!Array.isArray(response.recommendations) || !Array.isArray(response.notes))
      throw new Error('The places response was incomplete. Please try again.')
    return { response, saved: false }
  } catch (error) {
    if (!connectionFailure(error)) throw error
    const saved = savedDemo(request)
    if (saved) return saved
    throw new Error(
      request.demo
        ? 'No saved demo matches these settings. Try the default demo, or reconnect to calculate this selection.'
        : "Campus data isn't loading. Try the demo below.",
    )
  }
}
export async function swapResetSpot(
  request: ResetRequest,
  spot_id: string,
  reason: 'full' | 'locked' | 'another',
): Promise<ResetResult> {
  const replay = savedDemo(request)
  if (replay) return replay
  try {
    return {
      response: await api<ResetResponse>('/reset-spots/swap', {
        request: engineRequest(request),
        spot_id,
        reason,
      }),
      saved: false,
    }
  } catch (error) {
    if (!connectionFailure(error)) throw error
    const saved = savedDemo(request)
    if (saved) return saved
    throw new Error(
      'A new alternative needs a connection. This spot is hidden in your session for 45 minutes.',
    )
  }
}

// UI exclusions expire by elapsed wall time. The deterministic demo engine evaluates a fixed clock.
export function engineRequest(request: ResetRequest): ResetRequest {
  if (!request.demo) return request
  const clock = Date.parse(request.demo_time ?? DEMO_TIME)
  const now = Date.now()
  return {
    ...request,
    exclusions: activeExclusions(request.exclusions ?? [], now).map((entry) => ({
      spot_id: entry.spot_id,
      until: new Date(clock + Math.min(45 * 60000, Date.parse(entry.until) - now)).toISOString(),
    })),
  }
}
