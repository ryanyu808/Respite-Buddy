import { Check, Footprints, Leaf, Timer } from 'lucide-react'
import type { Route } from '../types'
import { distance } from '../preferences'

export function RouteCard({
  route,
  selected,
  recommended,
  onSelect,
}: {
  route: Route
  selected: boolean
  recommended: boolean
  onSelect: () => void
}) {
  return (
    <button
      className={`route-card ${route.id} ${selected ? 'selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="route-card-title">
        <span>
          <i className={`route-swatch ${route.id}`} />
          {route.name}
        </span>
        <span className={`radio ${selected ? 'checked' : ''}`}>
          {selected && <Check size={12} />}
        </span>
      </div>
      {recommended && (
        <span className="recommended-label">
          <Leaf size={11} /> Best match for you
        </span>
      )}
      <div className="route-card-metrics">
        <strong>
          {Math.ceil(route.duration_min)}
          <span> min</span>
        </strong>
        <span>
          <Footprints size={14} />
          {distance(route.distance_m)}
        </span>
        <span className="exposure-value">
          {route.exposure}
          <small>
            /100
            <br />
            est. exposure
          </small>
        </span>
      </div>
      <div className="route-card-bottom">
        <span>
          <Timer size={12} />
          {route.extra_minutes > 0
            ? `+${route.extra_minutes.toFixed(1)} min`
            : 'Shortest walking distance'}
        </span>
        {route.reduction_pct > 0 && <span>{Math.round(route.reduction_pct)}% lower estimate</span>}
      </div>
    </button>
  )
}
