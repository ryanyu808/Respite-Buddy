import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownUp,
  ArrowRight,
  Compass,
  Info,
  Leaf,
  LoaderCircle,
  MapPin,
  Play,
  Trees,
  X,
  Contrast,
} from 'lucide-react'
import type { FeatureCollection } from 'geojson'
import type {
  Demo,
  Location,
  Metadata,
  Point,
  Preferences,
  RestStop,
  RouteRequest,
  RouteResponse,
} from './types'
import { api } from './services/api'
import { loadPreferences } from './preferences'
import { LocationSelector } from './components/LocationSelector'
import { PreferencesPanel } from './components/PreferencesPanel'
import { Assistant } from './components/Assistant'
import { MapView } from './components/MapView'
import { Results } from './components/Results'
import { InfoDialog } from './components/InfoDialog'

function point(location: Point): Point {
  return { lat: location.lat, lon: location.lon, name: location.name }
}

export default function App() {
  const [locations, setLocations] = useState<Location[]>([])
  const [metadata, setMetadata] = useState<Metadata | null>(null)
  const [stops, setStops] = useState<RestStop[]>([])
  const [features, setFeatures] = useState<FeatureCollection | null>(null)
  const [demos, setDemos] = useState<Demo[]>([])
  const [origin, setOrigin] = useState<Point | null>(null)
  const [destination, setDestination] = useState<Point | null>(null)
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences)
  const [result, setResult] = useState<RouteResponse | null>(null)
  const [selected, setSelected] = useState('')
  const [lastRequest, setLastRequest] = useState<RouteRequest | null>(null)
  const [pickMode, setPickMode] = useState<'origin' | 'destination' | null>(null)
  const [page, setPage] = useState<'about' | 'methodology' | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showStops, setShowStops] = useState(false)
  const [highContrast, setHighContrast] = useState(false)
  const [retry, setRetry] = useState(0)
  const requestSequence = useRef(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([
      api<Location[]>('/locations'),
      api<Metadata>('/map/metadata'),
      api<RestStop[]>('/rest-stops'),
      api<FeatureCollection>('/map/features'),
      api<Demo[]>('/demo-scenarios'),
    ])
      .then(([places, meta, rest, green, demo]) => {
        if (cancelled) return
        setLocations(places)
        setMetadata(meta)
        setStops(rest)
        setFeatures(green)
        setDemos(demo)
        setOrigin(places.find((p) => p.name === 'USC Village') ?? places[0] ?? null)
        setDestination(places.find((p) => p.name === 'Leavey Library') ?? places[1] ?? null)
        if (!meta.available) setError(meta.setup_error ?? 'Map setup required.')
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [retry])

  useEffect(() => {
    try {
      localStorage.setItem('neuroroute-preferences', JSON.stringify(preferences))
    } catch {
      /* Browser storage is optional. */
    }
  }, [preferences])

  function invalidate() {
    requestSequence.current += 1
    setBusy(false)
    setResult(null)
    setLastRequest(null)
    setError('')
  }
  function changePreferences(p: Preferences) {
    invalidate()
    setPreferences(p)
  }
  function changeOrigin(p: Point | null) {
    invalidate()
    setOrigin(p)
  }
  function changeDestination(p: Point | null) {
    invalidate()
    setDestination(p)
  }

  async function calculate(p = preferences, start = origin, end = destination) {
    if (!start || !end) {
      setError('Choose both a start and a destination to find your walk.')
      return
    }
    if (start.lat === end.lat && start.lon === end.lon) {
      setError('Choose a different destination from your start.')
      return
    }
    const sequence = ++requestSequence.current
    const request = { origin: point(start), destination: point(end), preferences: p }
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const response = await api<RouteResponse>('/routes', request)
      if (sequence !== requestSequence.current) return
      setResult(response)
      setSelected(response.recommended_id)
      setLastRequest(request)
      setPickMode(null)
    } catch (e) {
      if (sequence === requestSequence.current) setError((e as Error).message)
    } finally {
      if (sequence === requestSequence.current) setBusy(false)
    }
  }

  function demo() {
    const d = demos[0]
    if (!d) return
    setOrigin(d.origin)
    setDestination(d.destination)
    setPreferences(d.preferences)
    void calculate(d.preferences, d.origin, d.destination)
  }

  return (
    <div className={`app-shell ${highContrast ? 'high-contrast' : ''}`}>
      <a className="skip-link" href="#route-controls">
        Skip to route controls
      </a>
      <header className="app-header">
        <a className="brand" href="/" aria-label="NeuroRoute home">
          <img src="/favicon.svg" alt="" width="38" height="38" />
          <span>
            Neuro<span>Route</span>
            <small>FIND YOUR CALMER WAY.</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <button className="nav-item active" onClick={() => setPage(null)}>
            <Compass size={16} />
            Plan a walk
          </button>
          <button className="nav-item" onClick={() => setPage('about')}>
            Our approach
          </button>
          <button className="nav-item" onClick={() => setPage('methodology')}>
            Behind the map
          </button>
        </nav>
        <div className="header-end">
          <span className="campus-tag">
            <MapPin size={14} />
            Made for USC
          </span>
          <button
            className="icon-button"
            aria-label="Toggle high contrast"
            aria-pressed={highContrast}
            onClick={() => setHighContrast(!highContrast)}
          >
            <Contrast size={19} />
          </button>
        </div>
      </header>
      <main className={`workspace ${result ? 'has-results' : ''}`}>
        <aside className="sidebar" id="route-controls" aria-label="Plan your walking route">
          <div className="sidebar-intro">
            <div className="eyebrow">
              <Leaf size={13} /> A WALK THAT FEELS LIKE YOU
            </div>
            <h1>Find your calmer way.</h1>
            <p>
              The best route isn't always the fastest.
              <br />
              Let's find one that fits you.
            </p>
          </div>
          <section className="journey" aria-label="Start and destination">
            <div className="section-heading">
              <h2>Where are we heading?</h2>
              <button
                className="icon-button"
                aria-label="Swap start and destination"
                onClick={() => {
                  invalidate()
                  setOrigin(destination)
                  setDestination(origin)
                }}
              >
                <ArrowDownUp size={16} />
              </button>
            </div>
            <div className="location-pair">
              <LocationSelector
                id="origin"
                label="Start"
                value={origin}
                locations={locations}
                onChange={changeOrigin}
              />
              <div className="location-line" />
              <LocationSelector
                id="destination"
                label="Destination"
                value={destination}
                locations={locations}
                onChange={changeDestination}
              />
            </div>
            <button className="map-selection-hint" onClick={() => setPickMode('origin')}>
              <MapPin size={12} />
              Or choose a point on the map <ArrowRight size={12} />
            </button>
          </section>
          <PreferencesPanel value={preferences} onChange={changePreferences} />
          <Assistant
            current={preferences}
            onApply={(p) => {
              changePreferences(p)
              void calculate(p)
            }}
          />
          <div className="sidebar-footnote">
            <Info size={15} />
            <span>
              Real walking paths. Estimated sensory conditions.
              <button onClick={() => setPage('methodology')}>
                See how we estimate <ArrowUpRightIcon />
              </button>
            </span>
          </div>
          <div className="find-route-area">
            {error && (
              <div className="error-message" role="alert">
                <Info size={16} />
                <span>
                  {error}
                  {!metadata?.available && (
                    <button onClick={() => setRetry(retry + 1)}>Retry connection</button>
                  )}
                </span>
                <button
                  className="icon-button"
                  aria-label="Dismiss error"
                  onClick={() => setError('')}
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <button
              className="primary-button find-route"
              disabled={loading || busy || !metadata?.available}
              onClick={() => void calculate()}
            >
              {loading || busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <Compass size={19} />
              )}
              {loading ? 'Loading campus map…' : busy ? 'Finding your way…' : 'Find My Route'}
              {!loading && !busy && <ArrowRight size={17} />}
            </button>
            <p>No account. Just your preferences.</p>
          </div>
        </aside>
        <div className="map-workspace">
          <MapView
            origin={origin}
            destination={destination}
            result={result}
            selected={selected}
            onSelect={setSelected}
            pickMode={pickMode}
            setPickMode={setPickMode}
            onPick={(p) => {
              if (pickMode === 'origin') changeOrigin(p)
              else if (pickMode === 'destination') changeDestination(p)
              setPickMode(null)
            }}
            stops={stops}
            showStops={showStops}
            features={features}
          />
          <div className="map-bottom-controls">
            <label className="rest-toggle">
              <Trees size={16} />
              <span>Potential rest stops</span>
              <input
                type="checkbox"
                checked={showStops}
                onChange={(e) => setShowStops(e.target.checked)}
              />
              <i aria-hidden="true" />
            </label>
            {!result && demos.length > 0 && (
              <button className="demo-button" onClick={demo} disabled={busy}>
                <Play size={13} fill="currentColor" />
                Try a campus demo
                <ArrowRight size={14} />
              </button>
            )}
          </div>
          {result && lastRequest && (
            <Results
              result={result}
              selected={selected}
              onSelect={setSelected}
              request={lastRequest}
              onClose={() => {
                invalidate()
              }}
            />
          )}
          {busy && (
            <div className="map-loading" role="status">
              <LoaderCircle className="spin" size={23} />
              <strong>Finding a little more calm…</strong>
              <span>Comparing paths with your preferences.</span>
            </div>
          )}
        </div>
      </main>
      <footer className="app-footer">
        <span>
          <span className={`status-dot ${metadata?.available ? '' : 'offline'}`} />
          {metadata?.available
            ? 'Real OpenStreetMap walking network'
            : 'Connecting to campus data…'}
        </span>
        <p>Estimated conditions may differ. Follow posted signs and use your judgment.</p>
        <button onClick={() => setPage('methodology')}>
          Data & methodology <Info size={12} />
        </button>
      </footer>
      <div className="sr-only" aria-live="polite">
        {result
          ? `${result.routes.length} route options found. ${result.routes.find((r) => r.id === selected)?.name} selected.`
          : ''}
      </div>
      {page && <InfoDialog page={page} metadata={metadata} onClose={() => setPage(null)} />}
    </div>
  )
}

function ArrowUpRightIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M4 12 12 4M4 4h8v8" />
    </svg>
  )
}
