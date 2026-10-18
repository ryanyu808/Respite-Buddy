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
  HeartHandshake,
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
import { RespiteBuddy } from './components/RespiteBuddy'
import { FALLBACK, savedRoute, SAVED_NOTE } from './data/fallback'
import { DEFAULTS } from './preferences'
import {
  DEVICE_DEFAULTS,
  loadDevicePreferences,
  parseDeepLink,
  saveDevicePreferences,
} from './respite'
import { SupportFooter } from './components/SupportFooter'
import { MySchedule } from './components/MySchedule'
import { CampusDirectory } from './components/CampusDirectory'
import { DemoHome } from './components/DemoHome'
import type { ResetRequest } from './respite'
import type { CalendarEvent } from './calendar/model'
import './calendar.css'
import './smart-filters.css'
import { rememberCampus } from './smartContext'

function point(location: Point): Point {
  return { lat: location.lat, lon: location.lon, name: location.name }
}

export default function App() {
  const [locations, setLocations] = useState<Location[]>(FALLBACK.locations)
  const [metadata, setMetadata] = useState<Metadata | null>(FALLBACK.metadata)
  const [stops, setStops] = useState<RestStop[]>(FALLBACK.stops)
  const [features, setFeatures] = useState<FeatureCollection | null>(FALLBACK.features)
  const [demos, setDemos] = useState<Demo[]>(FALLBACK.demos)
  const [origin, setOrigin] = useState<Point | null>(
    FALLBACK.locations.find((place) => place.name === 'USC Village') ??
      FALLBACK.locations[0] ??
      null,
  )
  const [destination, setDestination] = useState<Point | null>(
    FALLBACK.locations.find((place) => place.name === 'Leavey Library') ??
      FALLBACK.locations[1] ??
      null,
  )
  const [preferences, setPreferences] = useState<Preferences>(
    () => parseDeepLink(window.location.search).preferences ?? loadPreferences(),
  )
  const [result, setResult] = useState<RouteResponse | null>(null)
  const [selected, setSelected] = useState('')
  const [lastRequest, setLastRequest] = useState<RouteRequest | null>(null)
  const [pickMode, setPickMode] = useState<'origin' | 'destination' | null>(null)
  const [page, setPage] = useState<'about' | 'methodology' | null>(null)
  const [surface, setSurface] = useState<'demo' | 'reset' | 'walk' | 'schedule' | 'directory'>(
    () => {
      if (window.location.hash === '#walk') return 'walk'
      if (
        new URLSearchParams(window.location.search).get('live') === '1' ||
        parseDeepLink(window.location.search).auto
      )
        return 'reset'
      return 'demo'
    },
  )
  const [resetContext, setResetContext] = useState<ResetRequest | undefined>()
  const [scheduleSample, setScheduleSample] = useState<CalendarEvent[] | null>(null)
  const [scheduleDate, setScheduleDate] = useState<string | undefined>()
  function openReset(request: ResetRequest) {
    setResetContext(request)
    setSurface('reset')
  }
  function openDemo() {
    setSurface('demo')
  }
  const [deviceSettings, setDeviceSettings] = useState(loadDevicePreferences)
  const [campusSource, setCampusSource] = useState<'connecting' | 'live' | 'saved'>('connecting')
  const [savedResult, setSavedResult] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showStops, setShowStops] = useState(false)
  const [retry, setRetry] = useState(0)
  const requestSequence = useRef(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setCampusSource('connecting')
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
        setCampusSource('live')
        if (!meta.available) setError(meta.setup_error ?? 'Map setup required.')
      })
      .catch((e) => {
        if (!cancelled) {
          setCampusSource('saved')
          setError((e as Error).message)
        }
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
  useEffect(() => {
    saveDevicePreferences(deviceSettings)
  }, [deviceSettings])

  function invalidate() {
    requestSequence.current += 1
    setBusy(false)
    setResult(null)
    setLastRequest(null)
    setError('')
    setSavedResult(false)
  }
  function changePreferences(p: Preferences) {
    invalidate()
    setPreferences(p)
  }
  function changeOrigin(p: Point | null) {
    if (p) rememberCampus(p)
    invalidate()
    setOrigin(p)
  }
  function changeDestination(p: Point | null) {
    invalidate()
    setDestination(p)
  }

  async function calculate(p = preferences, start = origin, end = destination, replay = false) {
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
      const saved = savedRoute(request)
      const useSaved = saved && (replay || campusSource !== 'live')
      let response: RouteResponse
      let fromSaved = false
      if (useSaved) {
        response = saved
        fromSaved = true
      } else {
        try {
          response = await api<RouteResponse>('/routes', request)
        } catch (e) {
          if (!saved) throw e
          response = saved
          fromSaved = true
        }
      }
      if (sequence !== requestSequence.current) return
      setResult(response)
      setSavedResult(fromSaved)
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
    void calculate(d.preferences, d.origin, d.destination, true)
  }

  return (
    <div
      className={`app-shell ${surface === 'demo' ? 'campus-shell demo-shell' : surface === 'reset' ? 'reset-shell' : surface === 'schedule' || surface === 'directory' ? 'campus-shell' : ''} ${deviceSettings.highContrast ? 'high-contrast' : ''} ${deviceSettings.lowSensory ? 'low-sensory' : ''}`}
    >
      <header className="app-header">
        <a
          className="skip-link"
          href={
            surface === 'reset'
              ? '#reset-controls'
              : surface === 'walk'
                ? '#route-controls'
                : '#campus-content'
          }
        >
          {surface === 'reset'
            ? 'Skip to reset controls'
            : surface === 'walk'
              ? 'Skip to route controls'
              : 'Skip to page content'}
        </a>
        <a className="brand" href="/">
          <img src="/favicon.svg" alt="" width="38" height="38" />
          <span>
            Respite <span>Buddy</span>
            <small>A LITTLE ROOM IN YOUR DAY.</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <button
            className={`nav-item ${surface === 'demo' ? 'active' : ''}`}
            aria-current={surface === 'demo' ? 'page' : undefined}
            onClick={openDemo}
          >
            <Leaf size={16} /> Find a spot
          </button>
          {surface === 'demo' || surface === 'directory' ? (
            <>
              <button className="nav-item" onClick={() => setSurface('schedule')}>
                My Schedule
              </button>
              <details className="demo-tools">
                <summary className="nav-item">More tools</summary>
                <div className="demo-tools-menu">
                  <button
                    onClick={() => {
                      setResetContext(undefined)
                      setSurface('reset')
                    }}
                  >
                    Live reset tools
                  </button>
                  <button onClick={() => setSurface('walk')}>Plan a walk</button>
                  <button
                    aria-current={surface === 'directory' ? 'page' : undefined}
                    onClick={() => setSurface('directory')}
                  >
                    Campus spaces
                  </button>
                  <button onClick={() => setPage('about')}>Our approach</button>
                  <button onClick={() => setPage('methodology')}>Behind the map</button>
                </div>
              </details>
            </>
          ) : (
            <>
              <button
                className={`nav-item ${surface === 'reset' ? 'active' : ''}`}
                aria-current={surface === 'reset' ? 'page' : undefined}
                onClick={() => {
                  setResetContext(undefined)
                  setSurface('reset')
                }}
              >
                <HeartHandshake size={16} /> Reset before class
              </button>
              <button
                className={`nav-item ${surface === 'walk' ? 'active' : ''}`}
                aria-current={surface === 'walk' ? 'page' : undefined}
                onClick={() => setSurface('walk')}
              >
                <Compass size={16} />
                Plan a walk
              </button>
              <button
                className={`nav-item ${surface === 'schedule' ? 'active' : ''}`}
                aria-current={surface === 'schedule' ? 'page' : undefined}
                onClick={() => setSurface('schedule')}
              >
                My Schedule
              </button>
              <button className="nav-item" onClick={() => setSurface('directory')}>
                Campus spaces
              </button>
              <button className="nav-item" onClick={() => setPage('about')}>
                Our approach
              </button>
              <button className="nav-item" onClick={() => setPage('methodology')}>
                Behind the map
              </button>
            </>
          )}
        </nav>
        <div className="header-end">
          <span className="campus-tag">
            <MapPin size={14} />
            Made for USC
          </span>
          <button
            className="icon-button"
            aria-label="Toggle high contrast"
            aria-pressed={deviceSettings.highContrast}
            onClick={() =>
              setDeviceSettings({ ...deviceSettings, highContrast: !deviceSettings.highContrast })
            }
          >
            <Contrast size={19} />
          </button>
        </div>
      </header>
      {surface === 'demo' ? (
        <DemoHome
          features={features}
          onLive={() => {
            setResetContext(undefined)
            setSurface('reset')
          }}
        />
      ) : surface === 'schedule' ? (
        <MySchedule
          onReset={openReset}
          onDirectory={() => setSurface('directory')}
          initialSample={scheduleSample}
          onSampleChange={setScheduleSample}
          initialDate={scheduleDate}
          onDateChange={setScheduleDate}
        />
      ) : surface === 'directory' ? (
        <CampusDirectory
          onDemo={openDemo}
          onWalk={(target) => {
            changeDestination(target)
            setSurface('walk')
            void calculate(preferences, origin, target)
          }}
        />
      ) : surface === 'reset' ? (
        <RespiteBuddy
          locations={locations}
          features={features}
          settings={deviceSettings}
          onSettings={setDeviceSettings}
          preferences={preferences}
          onPreferences={setPreferences}
          context={resetContext}
          onDirectory={() => setSurface('directory')}
          onSchedule={() => setSurface('schedule')}
          onClear={() => {
            setDeviceSettings({ ...DEVICE_DEFAULTS })
            setPreferences({ ...DEFAULTS })
            try {
              localStorage.removeItem('neuroroute-preferences')
            } catch {
              /* Optional storage. */
            }
          }}
        />
      ) : (
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
            <details className="walk-fine-tune" open>
              <summary>Fine-tune your walk</summary>
              <PreferencesPanel value={preferences} onChange={changePreferences} />
            </details>
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
            <button className="respite-cta" onClick={() => setSurface('reset')}>
              <HeartHandshake size={17} />
              <span>
                <strong>Need a reset?</strong>
                <small>Find a pause before class</small>
              </span>
              <ArrowRight size={15} />
            </button>
            <div className="find-route-area">
              {error && (
                <div className="error-message" role="alert">
                  <Info size={16} />
                  <span>
                    {error}
                    {campusSource !== 'live' && (
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
                disabled={busy || !metadata?.available}
                onClick={() => void calculate()}
              >
                {busy ? <LoaderCircle className="spin" size={18} /> : <Compass size={19} />}
                {busy ? 'Finding your way…' : 'Find My Route'}
                {!busy && <ArrowRight size={17} />}
              </button>
              <p>
                {loading
                  ? 'Using bundled map data while campus services connect.'
                  : 'No account. Just your preferences.'}
              </p>
              <SupportFooter />
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
              <>
                <span className="sr-only" role="status">
                  {savedResult ? SAVED_NOTE : 'Route calculated by campus service.'}
                </span>
                <Results
                  result={result}
                  selected={selected}
                  onSelect={setSelected}
                  request={lastRequest}
                  onClose={() => {
                    invalidate()
                  }}
                />
              </>
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
      )}
      <footer className="app-footer">
        <span>
          <span className={`status-dot ${metadata?.available ? '' : 'offline'}`} />
          {surface === 'demo'
            ? 'Presentation demo · saved routes'
            : campusSource === 'live'
              ? 'Real OpenStreetMap walking network'
              : campusSource === 'connecting'
                ? 'Bundled map · connecting to campus services'
                : 'Saved campus snapshot · offline'}
        </span>
        <p>
          {surface === 'demo'
            ? 'Sample conditions, not live observations.'
            : 'Estimated conditions may differ. Follow posted signs and use your judgment.'}
        </p>
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
