import data from '../data/demo-route-legs.json'
import type { Location, Point, RouteResponse } from '../types'
import type { ResetRequest, ResetResponse } from '../respite'

type LegPair = { outward?: RouteResponse | null; onward?: RouteResponse | null }
const catalog = data as unknown as {
  locations: Location[]
  legs: Record<string, Record<string, LegPair>>
}
export const DEMO_LOCATIONS = catalog.locations
const normalize = (text: string) =>
  text.trim().toLowerCase().replaceAll('.', '').replace(/\s+/g, ' ')
export function resolveDemoLocation(value: string | Point) {
  return DEMO_LOCATIONS.find((location) =>
    typeof value === 'string'
      ? [location.name, location.id, ...(location.aliases ?? [])].some(
          (name) => normalize(name) === normalize(value),
        )
      : Math.abs(location.lat - value.lat) < 0.00000005 &&
        Math.abs(location.lon - value.lon) < 0.00000005,
  )
}
const point = ({ lat, lon, name }: Location): Point => ({ lat, lon, name })
const walkingMinutes = (route: RouteResponse | null) =>
  route ? Math.ceil(route.routes.find((item) => item.id === route.recommended_id)!.duration_min) : 0

/** Compose only exact, engine-generated legs. Eligibility comes from the shared engine seed. */
export function campusJourneySeed(
  request: ResetRequest,
  seed: ResetResponse,
): ResetResponse | null {
  const origin = resolveDemoLocation(request.near)
  const next = request.next_class === null ? null : resolveDemoLocation(request.next_class)
  if (!origin || next === undefined) return null
  let unreachable = false
  const recommendations = seed.recommendations.flatMap((item) => {
    const outward = catalog.legs[origin.id]?.[item.spot.id]?.outward
    const onward = next ? catalog.legs[next.id]?.[item.spot.id]?.onward : null
    if (outward === undefined || onward === undefined) {
      unreachable = true
      return []
    }
    const link = new URL(item.deep_link)
    link.searchParams.set('from', `${origin.lat},${origin.lon}`)
    if (next) link.searchParams.set('next', `${next.lat},${next.lon}`)
    else link.searchParams.delete('next')
    return [
      {
        ...item,
        route_to_spot: outward,
        route_to_class: onward,
        walk_to_min: walkingMinutes(outward),
        walk_to_class_min: next ? walkingMinutes(onward) : null,
        deep_link: link.toString(),
      },
    ]
  })
  if (unreachable && !recommendations.length) return null
  return {
    ...seed,
    origin: point(origin),
    next_class: next ? point(next) : null,
    recommendations,
    notes: [
      ...seed.notes.filter((note) => !next || !note.includes('Rest time is provisional')),
      ...(unreachable
        ? [
            'Some spots cannot be connected to the selected buildings on this walking snapshot. No path has been invented.',
          ]
        : []),
    ],
  }
}
