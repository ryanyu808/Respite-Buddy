import { useEffect, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  GeoJSON,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import { LatLngBounds, type LatLngTuple } from 'leaflet'
import { LocateFixed, MapPin, Trees } from 'lucide-react'
import type { Point, RouteResponse, RestStop } from '../types'
import type { FeatureCollection } from 'geojson'

const colors: Record<string, string> = {
  fastest: '#b96f30',
  calmer: '#28735d',
  balanced: '#8572a8',
}

function MapController({
  result,
  selected,
  fit,
  onPick,
}: {
  result: RouteResponse | null
  selected: string
  fit: number
  onPick: (p: Point) => void
}) {
  const map = useMap()
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lon: e.latlng.lng, name: 'Map selection' })
    },
  })
  useEffect(() => {
    const route = result?.routes.find((r) => r.id === selected)
    if (route)
      map.fitBounds(new LatLngBounds(route.geometry.coordinates.map(([x, y]) => [y, x])), {
        padding: [45, 65],
        maxZoom: 17,
        animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      })
  }, [map, result, selected, fit])
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ pan: false })
      const route = result?.routes.find((r) => r.id === selected)
      if (route)
        map.fitBounds(new LatLngBounds(route.geometry.coordinates.map(([x, y]) => [y, x])), {
          padding: [35, 45],
          maxZoom: 17,
          animate: false,
        })
    })
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map, result, selected])
  return null
}

export function MapView({
  origin,
  destination,
  result,
  selected,
  onSelect,
  pickMode,
  setPickMode,
  onPick,
  stops,
  showStops,
  features,
}: {
  origin: Point | null
  destination: Point | null
  result: RouteResponse | null
  selected: string
  onSelect: (id: string) => void
  pickMode: 'origin' | 'destination' | null
  setPickMode: (p: 'origin' | 'destination' | null) => void
  onPick: (p: Point) => void
  stops: RestStop[]
  showStops: boolean
  features: FeatureCollection | null
}) {
  const [fit, setFit] = useState(0)
  const [hidden, setHidden] = useState<string[]>([])
  const [tileError, setTileError] = useState(false)
  const routes = result?.routes ?? []
  const shownStops = stops.filter((stop) => {
    if (!result) return true
    const route = routes.find((r) => r.id === selected)
    return route?.geometry.coordinates.some(
      ([x, y]) => Math.hypot((stop.lat - y) * 111000, (stop.lon - x) * 92000) < 200,
    )
  })
  useEffect(() => {
    setHidden([])
  }, [result])
  return (
    <section className="map-panel" aria-label="Interactive USC walking map">
      <MapContainer
        center={[34.022, -118.286]}
        zoom={16}
        minZoom={13}
        maxZoom={19}
        zoomControl={false}
        className="walking-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{ tileerror: () => setTileError(true) }}
        />
        <MapController result={result} selected={selected} fit={fit} onPick={onPick} />
        {features && (
          <GeoJSON
            data={features}
            style={{
              fillColor: '#a8c69e',
              fillOpacity: 0.2,
              color: '#9db795',
              weight: 1,
              interactive: false,
            }}
          />
        )}
        {[...routes]
          .sort((a, b) => Number(a.id === selected) - Number(b.id === selected))
          .filter((r) => !hidden.includes(r.id))
          .map((route) => (
            <Polyline
              key={route.id}
              positions={route.geometry.coordinates.map(([x, y]): LatLngTuple => [y, x])}
              pathOptions={{
                color: colors[route.id],
                weight: route.id === selected ? 7 : 5,
                opacity: route.id === selected ? 1 : 0.7,
                dashArray:
                  route.id === 'fastest' ? '9 7' : route.id === 'balanced' ? '3 7' : undefined,
              }}
              eventHandlers={{
                click: (e) => {
                  e.originalEvent.stopPropagation()
                  onSelect(route.id)
                },
              }}
            />
          ))}
        {[
          { point: result?.snapped_origin ?? origin, isStart: true },
          { point: result?.snapped_destination ?? destination, isStart: false },
        ].map(
          ({ point, isStart }) =>
            point && (
              <CircleMarker
                key={isStart ? 'origin' : 'destination'}
                center={[point.lat, point.lon]}
                radius={9}
                pathOptions={{
                  color: 'white',
                  weight: 3,
                  fillColor: isStart ? '#28735d' : '#6f5e8f',
                  fillOpacity: 1,
                }}
              >
                <Popup>
                  <strong>{isStart ? 'Start' : 'Destination'}</strong>
                  <br />
                  {point.name}
                </Popup>
              </CircleMarker>
            ),
        )}
        {showStops &&
          shownStops.map((stop) => (
            <CircleMarker
              key={stop.id}
              center={[stop.lat, stop.lon]}
              radius={5}
              pathOptions={{ color: '#496b3e', weight: 2, fillColor: '#eaf1e1', fillOpacity: 1 }}
            >
              <Popup>
                <strong>{stop.name}</strong>
                <br />
                Potential rest stop · {stop.kind}
                <br />
                {stop.opening_hours
                  ? `Mapped hours: ${stop.opening_hours}`
                  : 'Opening hours unknown.'}
                <br />
                Quietness and availability not verified.
                <br />
                <a href={stop.osm_url} target="_blank" rel="noreferrer">
                  View mapped source
                </a>
              </Popup>
            </CircleMarker>
          ))}
        <ZoomButtons />
      </MapContainer>
      <div className="map-location">
        <span className="status-dot" />
        USC · University Park
        <span className="map-location-divider" />
        Walking map
      </div>
      {!result && (
        <div className="map-welcome">
          <div className="eyebrow">
            <Trees size={14} /> A LITTLE SPACE TO BREATHE
          </div>
          <h2>
            Your campus.
            <br />
            At your pace.
          </h2>
          <p>
            Discover a walk that feels
            <br />
            more like you.
          </p>
        </div>
      )}
      <div className="map-tools">
        <button
          title="Fit selected route"
          aria-label="Fit selected route"
          onClick={() => setFit(fit + 1)}
          disabled={!result}
        >
          <LocateFixed size={19} />
        </button>
        <div className="map-pick-buttons">
          <button
            aria-pressed={pickMode === 'origin'}
            onClick={() => setPickMode(pickMode === 'origin' ? null : 'origin')}
          >
            <MapPin size={15} />
            Set start
          </button>
          <button
            aria-pressed={pickMode === 'destination'}
            onClick={() => setPickMode(pickMode === 'destination' ? null : 'destination')}
          >
            <MapPin size={15} />
            Set end
          </button>
        </div>
      </div>
      {pickMode && (
        <div className="pick-banner" role="status">
          Click the map to choose your {pickMode === 'origin' ? 'start' : 'destination'}.
          <button onClick={() => setPickMode(null)}>Cancel</button>
        </div>
      )}
      {tileError && (
        <div className="tile-warning">
          Some map tiles could not load. Check your internet connection; route results remain
          available.
        </div>
      )}
      <div className="map-legend" aria-label="Route visibility">
        {routes.length ? (
          routes.map((route) => (
            <label key={route.id}>
              <input
                type="checkbox"
                checked={!hidden.includes(route.id)}
                onChange={(e) =>
                  setHidden(
                    e.target.checked
                      ? hidden.filter((id) => id !== route.id)
                      : [...hidden, route.id],
                  )
                }
              />
              <i className={`route-swatch ${route.id}`} />
              {route.name.replace(' route', '')}
            </label>
          ))
        ) : (
          <>
            <span>
              <i className="route-swatch fastest" />
              Fastest
            </span>
            <span>
              <i className="route-swatch calmer" />
              Calmer
            </span>
            <span>
              <i className="route-swatch balanced" />
              Balanced
            </span>
          </>
        )}
      </div>
    </section>
  )
}

function ZoomButtons() {
  const map = useMap()
  return (
    <div className="zoom-buttons">
      <button aria-label="Zoom in" onClick={() => map.zoomIn()}>
        +
      </button>
      <button aria-label="Zoom out" onClick={() => map.zoomOut()}>
        −
      </button>
    </div>
  )
}
