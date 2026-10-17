export type Pace = 'fastest' | 'balanced' | 'calmest'
export type Preferences = {
  noise: number
  crowds: number
  traffic: number
  green: number
  pace: Pace
  max_detour: 10 | 20 | 30 | null
}
export type Point = { lat: number; lon: number; name: string }
export type Location = Point & { id: string; osm_url: string }
export type RestStop = Location & { kind: string; opening_hours: string | null }
export type RouteRequest = { origin: Point; destination: Point; preferences: Preferences }
export type Route = {
  id: string
  name: string
  roles: string[]
  distance_m: number
  duration_min: number
  exposure: number
  breakdown: { noise: number; traffic: number; green: number | null; crowds: number | null }
  major_road_m: number
  extra_minutes: number
  reduction_pct: number
  detour_pct: number
  confidence: string
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  streets: string[]
  explanation: string
}
export type RouteResponse = {
  routes: Route[]
  recommended_id: string
  notes: string[]
  snapped_origin: Point
  snapped_destination: Point
  origin_snap_m: number
  destination_snap_m: number
  explanation_mode: string
}
export type Metadata = {
  available: boolean
  setup_error?: string
  source: string
  retrieved_at?: string
  bounds?: [number, number, number, number]
  nodes?: number
  edges?: number
  features?: Record<string, boolean>
  notes?: string[]
}
export type Interpretation = {
  preferences: Preferences
  explanation: string
  mode: string
  notes: string[]
}
export type Demo = {
  origin: Location
  destination: Location
  preferences: Preferences
  reduction_pct: number
}
