import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  Footprints,
  Leaf,
  LoaderCircle,
  MapPin,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import type { FeatureCollection } from 'geojson'
import type { Location, Point, Preferences } from '../types'
import { DEFAULTS, PRESETS } from '../preferences'
import { FALLBACK } from '../data/fallback'
import { api } from '../services/api'
import { findResetSpots, swapResetSpot } from '../services/respiteApi'
import {
  activeExclusions,
  DEMO_TIME,
  loadExclusions,
  NEEDS,
  parseDeepLink,
  routeDescription,
  saveExclusions,
  timeLabel,
  type DevicePreferences,
  type Exclusion,
  type Recommendation,
  type ResetRequest,
  type ResetResult,
} from '../respite'
import { PreferencesPanel } from './PreferencesPanel'
import { MapView } from './MapView'
import { SupportFooter } from './SupportFooter'
import { SpotCard } from './SpotCard'
import { SmartFilterControls } from './SmartFilterControls'
import { DEFAULT_FILTERS, loadFilters, saveFilters, type SmartFilters } from '../smartFilters'
import {
  contextualSuggestion,
  scheduleContext,
  rememberedCampus,
  rememberCampus,
  clearRememberedCampus,
} from '../smartContext'
import { readSchedule } from '../calendar/storage'
import type { CalendarEvent } from '../calendar/model'
import { BreakTimeControls } from './BreakTimeControls'

type Props = {
  locations: Location[]
  features: FeatureCollection | null
  settings: DevicePreferences
  onSettings: (settings: DevicePreferences) => void
  preferences: Preferences
  onPreferences: (preferences: Preferences) => void
  onClear: () => void
  context?: ResetRequest
  onDirectory?: () => void
  onSchedule?: () => void
}
const placeText = (place: string | Point | null) =>
  typeof place === 'string' ? place : (place?.name ?? '')

export function RespiteBuddy({
  locations,
  features,
  settings,
  onSettings,
  preferences,
  onPreferences,
  onClear,
  context,
  onDirectory,
  onSchedule,
}: Props) {
  const [link] = useState(() => parseDeepLink(window.location.search))
  const [near, setNear] = useState<string | Point>(
    link.near ?? rememberedCampus() ?? 'Leavey Library',
  )
  const [locationSource, setLocationSource] = useState(
    link.near
      ? 'Linked starting point'
      : rememberedCampus()
        ? 'Last selected campus starting point'
        : 'Default campus starting point (not your current location)',
  )
  const [filters, setFilters] = useState<SmartFilters>(link.filters ?? loadFilters())
  const [schedule, setSchedule] = useState<CalendarEvent[]>([])
  const [dismissedSuggestion, setDismissedSuggestion] = useState('')
  const [showBackups, setShowBackups] = useState(false)
  const [showDirections, setShowDirections] = useState(Boolean(link.to || context))
  const [adjust, setAdjust] = useState(false)
  const scheduleRef = useRef<CalendarEvent[]>([])
  const classDeadlineRef = useRef<string | undefined>(
    context?.next_class ? context.deadline : link.next ? link.deadline : undefined,
  )
  const [nextClass, setNextClass] = useState<string | Point | null>(link.next)
  const [buildings, setBuildings] = useState<Location[]>(FALLBACK.buildings ?? locations)
  const [uscId, setUscId] = useState(link.usc_id ?? false)
  const [demo, setDemo] = useState(link.demo)
  const [demoTime, setDemoTime] = useState(link.demo_time ?? DEMO_TIME)
  const [deadline, setDeadline] = useState<string | undefined>(link.deadline)
  const [planningTime, setPlanningTime] = useState<string | undefined>(context?.now)
  const [result, setResult] = useState<ResetResult | null>(null)
  const [selectedId, setSelectedId] = useState(link.to ?? '')
  const [routeId, setRouteId] = useState('')
  const [leg, setLeg] = useState<'spot' | 'class'>('spot')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [calendar, setCalendar] = useState(false)
  const [exclusions, setExclusions] = useState<Exclusion[]>(loadExclusions)
  const [lastRequest, setLastRequest] = useState<ResetRequest | null>(null)
  const [kept, setKept] = useState(false)
  const [events, setEvents] = useState({ kept: 0, full: 0, demoKept: 0, demoFull: 0 })
  const [firstTries, setFirstTries] = useState({ kept: 0, full: 0, demoKept: 0, demoFull: 0 })
  const attempt = useRef<{ spotId: string; demo: boolean; resolved: boolean } | null>(null)
  const sequence = useRef(0)
  const hasRun = useRef(false)
  const linkApplied = useRef(false)
  const resultRef = useRef<HTMLElement>(null)
  const routeRef = useRef<HTMLElement>(null)
  const [minutes, setMinutes] = useState(link.minutes ?? settings.minutes)
  const [needs, setNeeds] = useState(link.needs ?? settings.needs)
  useEffect(() => {
    if (!demo) saveFilters(filters)
  }, [filters, demo])
  useEffect(() => {
    let mounted = true
    readSchedule()
      .then((value) => {
        if (mounted) {
          scheduleRef.current = value
          setSchedule(value)
        }
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])
  const automaticContext = scheduleContext(schedule)
  const suggestion = contextualSuggestion(
    demo ? demoTime : new Date().toISOString(),
    demo ? null : automaticContext,
  )

  useEffect(() => {
    let cancelled = false
    api<Location[]>('/buildings')
      .then((value) => {
        if (!cancelled && Array.isArray(value)) setBuildings(value)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  useEffect(() => {
    if (!buildings.length && locations.length) setBuildings(locations)
  }, [locations, buildings.length])
  useEffect(
    () => () => {
      sequence.current += 1
    },
    [],
  )

  function request(overrides: Partial<ResetRequest> = {}): ResetRequest {
    return {
      near,
      next_class: nextClass || null,
      minutes,
      needs,
      demo,
      usc_id: uscId,
      preferences,
      filters,
      deadline,
      ...(!demo && planningTime ? { now: planningTime } : {}),
      exclusions: activeExclusions(exclusions),
      ...(demo ? { demo_time: demoTime } : {}),
      ...overrides,
    }
  }
  async function search(overrides: Partial<ResetRequest> = {}, focus = false) {
    const id = ++sequence.current
    const input = request(overrides)
    hasRun.current = true
    setBusy(true)
    setError('')
    setNotice('')
    setResult(null)
    setKept(false)
    setLastRequest(input)
    try {
      const value = await findResetSpots(input)
      if (id !== sequence.current) return
      setResult(value)
      setShowBackups(false)
      setDeadline(value.response.deadline)
      setLastRequest({ ...input, deadline: value.response.deadline })
      const requestedSpot = !linkApplied.current ? link.to : null
      linkApplied.current = true
      const available = value.response.recommendations.length
        ? value.response.recommendations
        : (value.response.documented_options ?? [])
      const selected = available.find((item) => item.spot.id === requestedSpot) ?? available[0]
      attempt.current = selected
        ? { spotId: selected.spot.id, demo: value.response.mode === 'demo', resolved: false }
        : null
      if (requestedSpot && selected?.spot.id !== requestedSpot)
        setNotice(
          'The linked spot is not eligible for these settings. Showing the available alternatives.',
        )
      setSelectedId(selected?.spot.id ?? '')
      setRouteId(
        selected?.route_to_spot?.recommended_id ?? selected?.route_to_class?.recommended_id ?? '',
      )
      setLeg(selected?.route_to_spot ? 'spot' : 'class')
      if (focus) resultRef.current?.focus()
    } catch (e) {
      if (id === sequence.current)
        setError(e instanceof Error ? e.message : 'Places could not load. Please try again.')
    } finally {
      if (id === sequence.current) setBusy(false)
    }
  }
  useEffect(() => {
    if (link.auto && !context) void search()
  }, [])
  useEffect(() => {
    if (!context) return
    setShowDirections(true)
    setNear(context.near)
    setNextClass(context.next_class)
    setMinutes(context.minutes)
    setNeeds(context.needs)
    setDemo(context.demo)
    setDemoTime(context.demo_time ?? DEMO_TIME)
    setUscId(context.usc_id)
    setDeadline(context.deadline)
    setPlanningTime(context.now)
    classDeadlineRef.current = context.next_class ? context.deadline : undefined
    if (context.filters || context.demo) setFilters(context.filters ?? { ...DEFAULT_FILTERS })
    setLocationSource(
      context.demo
        ? 'Sample starting point'
        : typeof context.near === 'string'
          ? 'Selected campus starting point'
          : 'Selected starting point (not live location)',
    )
    if (context.preferences) onPreferences(context.preferences)
    void search(
      {
        ...context,
        filters: context.filters ?? (context.demo ? { ...DEFAULT_FILTERS } : filters),
        preferences: context.preferences ?? preferences,
        exclusions: [],
      },
      true,
    )
  }, [context])
  function quickSearch() {
    setShowDirections(false)
    const available =
      !demo && !context && !link.auto && !planningTime ? scheduleContext(scheduleRef.current) : null
    if (available) {
      setNextClass(available.next_class)
      setMinutes(available.minutes)
      setDeadline(available.deadline)
      classDeadlineRef.current = available.deadline
    }
    void search(available ?? {}, true)
  }
  function updateFilters(value: SmartFilters) {
    setFilters(value)
    if (hasRun.current) void search({ filters: value })
  }
  function useApprovedLocation() {
    if (!navigator.geolocation) {
      setNotice('Location is unavailable. The labeled campus starting point still works.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          name: 'Your approved location',
        }
        if (
          point.lat < 34.01 ||
          point.lat > 34.032 ||
          point.lon < -118.298 ||
          point.lon > -118.277
        ) {
          setNotice('That location is outside the campus snapshot. Choose a campus starting point.')
          return
        }
        setLocationSource('Your approved location (this session only)')
        change({ near: point })
      },
      () =>
        setNotice('Location was not available. Your labeled campus starting point is unchanged.'),
      { timeout: 5000, maximumAge: 60000 },
    )
  }

  function change(input: Partial<ResetRequest>) {
    if (input.minutes !== undefined) {
      const value = input.minutes
      setMinutes(value)
      const classDeadline = classDeadlineRef.current
      setDeadline(classDeadline)
      input = { ...input, deadline: classDeadline }
      onSettings({ ...settings, minutes: value, needs: input.needs ?? needs })
    }
    if (input.needs !== undefined) {
      setNeeds(input.needs)
      onSettings({ ...settings, minutes: input.minutes ?? minutes, needs: input.needs })
    }
    if (input.near !== undefined) {
      setNear(input.near)
      rememberCampus(input.near)
      if (typeof input.near === 'string')
        setLocationSource('Selected campus starting point (not live location)')
    }
    if ('next_class' in input) setNextClass(input.next_class ?? null)
    if (input.usc_id !== undefined) setUscId(input.usc_id)
    if (input.preferences) onPreferences(input.preferences)
    if (hasRun.current) void search(input)
  }
  function startDemo() {
    const demoExclusions = activeExclusions(exclusions).filter(
      (entry) => !entry.spot_id.startsWith('demo-'),
    )
    setExclusions(demoExclusions)
    saveExclusions(demoExclusions)
    setDemo(true)
    setPlanningTime(undefined)
    setShowDirections(false)
    setLocationSource('Sample starting point (not your current location)')
    classDeadlineRef.current = undefined
    setFilters({ ...DEFAULT_FILTERS })
    setDemoTime(DEMO_TIME)
    setNear('Leavey')
    setNextClass(null)
    setUscId(false)
    setMinutes(15)
    setNeeds([])
    onPreferences({ ...DEFAULTS })
    setDeadline(undefined)
    void search(
      {
        near: 'Leavey',
        next_class: null,
        minutes: 15,
        needs: [],
        demo: true,
        demo_time: DEMO_TIME,
        deadline: undefined,
        usc_id: false,
        preferences: { ...DEFAULTS },
        filters: { ...DEFAULT_FILTERS },
        exclusions: demoExclusions,
      },
      true,
    )
  }
  async function swap(item: Recommendation, reason: 'full' | 'locked' | 'another') {
    if (!lastRequest) return
    const id = ++sequence.current
    const excluded = [
      ...activeExclusions(exclusions).filter((entry) => entry.spot_id !== item.spot.id),
      { spot_id: item.spot.id, until: new Date(Date.now() + 45 * 60000).toISOString() },
    ]
    setExclusions(excluded)
    saveExclusions(excluded)
    const input = {
      ...lastRequest,
      ...(!lastRequest.demo && context
        ? {
            now: new Date(
              Math.max(Date.now(), Date.parse(lastRequest.now ?? new Date().toISOString())),
            ).toISOString(),
          }
        : {}),
      exclusions: excluded,
    }
    setLastRequest(input)
    setBusy(true)
    setError('')
    setKept(false)
    setResult((previous) =>
      previous
        ? {
            ...previous,
            response: {
              ...previous.response,
              recommendations: previous.response.recommendations.filter(
                (entry) => entry.spot.id !== item.spot.id,
              ),
              documented_options: previous.response.documented_options?.filter(
                (entry) => entry.spot.id !== item.spot.id,
              ),
            },
          }
        : null,
    )
    if (reason === 'full')
      setEvents((value) => ({
        ...value,
        [demo ? 'demoFull' : 'full']: value[demo ? 'demoFull' : 'full'] + 1,
      }))
    recordFirstTry(item.spot.id, reason === 'full' ? 'full' : null)
    try {
      const value = await swapResetSpot(input, item.spot.id, reason)
      if (id !== sequence.current) return
      setResult(value)
      setDeadline(value.response.deadline)
      setLastRequest({ ...input, deadline: value.response.deadline })
      const selected = value.response.recommendations[0] ?? value.response.documented_options?.[0]
      setSelectedId(selected?.spot.id ?? '')
      setRouteId(
        selected?.route_to_spot?.recommended_id ?? selected?.route_to_class?.recommended_id ?? '',
      )
      setLeg(selected?.route_to_spot ? 'spot' : 'class')
      setNotice(
        `That spot is hidden for 45 minutes in this browser session. ${selected ? 'Here is another option.' : 'No eligible backup remains. Try more time or fewer needs.'}`,
      )
      resultRef.current?.focus()
    } catch (e) {
      if (id === sequence.current) {
        setError(e instanceof Error ? e.message : 'An alternative could not load.')
        setSelectedId('')
      }
    } finally {
      if (id === sequence.current) setBusy(false)
    }
  }
  function recordFirstTry(spotId: string, outcome: 'kept' | 'full' | null) {
    const current = attempt.current
    if (!current || current.resolved) return
    // Any swap resolves the attempt; only an explicit first-spot acceptance/full report enters the rate.
    if (current.spotId === spotId && outcome) {
      const key = current.demo ? (outcome === 'kept' ? 'demoKept' : 'demoFull') : outcome
      setFirstTries((value) => ({ ...value, [key]: value[key] + 1 }))
    }
    current.resolved = true
  }
  const documented =
    !result?.response.recommendations.length && !!result?.response.documented_options?.length
  const recommendations =
    (documented ? result?.response.documented_options : result?.response.recommendations) ?? []
  const selected = recommendations.find((item) => item.spot.id === selectedId)
  const routeResult = selected
    ? leg === 'class'
      ? selected.route_to_class
      : selected.route_to_spot
    : null
  const route = routeResult?.routes.find((item) => item.id === routeId) ?? routeResult?.routes[0]
  const backup = selected
    ? recommendations.find((item) => item.spot.id === selected.backup_id)
    : null

  return (
    <main
      className={`reset-page ${!result && !busy && !error ? 'zero-start' : ''}`}
      id="reset-controls"
      tabIndex={-1}
    >
      <div className="reset-hero">
        <div>
          <div className="eyebrow">
            <Leaf size={15} /> A LITTLE ROOM IN YOUR DAY
          </div>
          <h1>
            Reset before class<span>.</span>
          </h1>
          <p>Find somewhere to pause, with time to get where you’re going.</p>
        </div>
        <div className="reset-privacy">
          <ShieldCheck size={18} />
          <span>
            No account needed.
            <br />
            Preferences stay on this device.
          </span>
        </div>
      </div>
      <div className="reset-layout">
        <section className="reset-controls" aria-label="Find a reset spot">
          <div className="section-heading">
            <h2>Your next little break</h2>
            <span className="reset-campus">USC · University Park</span>
          </div>
          <button className="primary-button reset-primary" disabled={busy} onClick={quickSearch}>
            {busy ? <LoaderCircle className="spin" size={19} /> : <Leaf size={19} />}
            {busy ? 'Finding your pause…' : 'Somewhere calm, now'}
          </button>
          <p className="reset-default-note">
            {locationSource}: {placeText(near)}.{' '}
            {automaticContext && !nextClass
              ? `${automaticContext.minutes} minutes before your next class.`
              : nextClass
                ? `Next stop: ${placeText(nextClass)}.`
                : `${minutes} minute break; no next-class walk included.`}
          </p>
          <details
            className="reset-adjust"
            open={adjust}
            onToggle={(e) => setAdjust(e.currentTarget.open)}
          >
            <summary
              onClick={(e) => {
                e.preventDefault()
                setAdjust(!adjust)
              }}
            >
              Change preferences <span>Adjust time, starting point &amp; more</span>
            </summary>
            <BreakTimeControls
              key={demo ? 'sample-time' : 'campus-time'}
              minutes={minutes}
              clock={demo ? demoTime : (planningTime ?? new Date().toISOString())}
              onPreset={(value) => {
                setPlanningTime(undefined)
                change({ minutes: value, now: undefined })
              }}
              onWindow={(window) => {
                setMinutes(window.minutes)
                setDeadline(window.deadline)
                classDeadlineRef.current = window.deadline
                if (demo) setDemoTime(window.now)
                else setPlanningTime(window.now)
                onSettings({ ...settings, minutes: window.minutes, needs })
                void search(
                  {
                    minutes: window.minutes,
                    deadline: window.deadline,
                    ...(demo ? { demo_time: window.now } : { now: window.now }),
                  },
                  true,
                )
              }}
            />
            <fieldset className="reset-needs">
              <legend>
                Reset preferences <span>Optional</span>
              </legend>
              <div className="reset-chips">
                {NEEDS.map(({ id, label }) => (
                  <button
                    key={id}
                    aria-pressed={needs.includes(id)}
                    onClick={() =>
                      change({
                        needs: needs.includes(id)
                          ? needs.filter((need) => need !== id)
                          : [
                              ...needs.filter(
                                (need) =>
                                  !(id === 'indoor' && need === 'outdoor') &&
                                  !(id === 'outdoor' && need === 'indoor'),
                              ),
                              id,
                            ],
                      })
                    }
                  >
                    {needs.includes(id) && <Check size={13} />}
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="reset-presets" role="group" aria-label="Walking presets">
              <span>Walking style</span>
              <div className="preset-list">
                {Object.entries(PRESETS).map(([name, value]) => (
                  <button
                    key={name}
                    className={`chip ${JSON.stringify(value) === JSON.stringify(preferences) ? 'active' : ''}`}
                    aria-pressed={JSON.stringify(value) === JSON.stringify(preferences)}
                    onClick={() => change({ preferences: { ...value } })}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <details className="reset-fine-tune">
              <summary>
                Fine-tune <span>Location, next class & walking preferences</span>
              </summary>
              <button className="reset-link" onClick={useApprovedLocation}>
                Use my location (optional permission)
              </button>
              <label className="reset-field">
                Starting near
                <input
                  list="reset-buildings"
                  value={placeText(near)}
                  maxLength={120}
                  onChange={(e) => change({ near: e.target.value })}
                  onBlur={() => {
                    if (!placeText(near).trim()) change({ near: 'Leavey' })
                  }}
                />
              </label>
              <label className="reset-field">
                Next class <span>Optional building or code</span>
                <input
                  list="reset-buildings"
                  value={placeText(nextClass)}
                  placeholder="e.g. Leavey · verified buildings only"
                  maxLength={120}
                  onChange={(e) => change({ next_class: e.target.value || null })}
                />
              </label>
              <datalist id="reset-buildings">
                {buildings.map((building) => (
                  <option key={building.id} value={building.name} />
                ))}
              </datalist>
              <p className="reset-small">
                Building names and supported codes resolve through the campus library. Unsupported
                buildings need verified coordinates.
              </p>
              <label className="reset-check">
                <input
                  type="checkbox"
                  checked={uscId}
                  onChange={(e) => change({ usc_id: e.target.checked })}
                />
                I have a USC ID for spaces that require it
              </label>
              <PreferencesPanel
                value={preferences}
                onChange={(value) => change({ preferences: value })}
                showPresets={false}
              />
              <label className="reset-check">
                <input
                  type="checkbox"
                  checked={settings.lowSensory}
                  onChange={(e) => onSettings({ ...settings, lowSensory: e.target.checked })}
                />
                Low-sensory display · larger text, no motion
              </label>
              <button
                className="reset-link"
                onClick={() => {
                  onClear()
                  classDeadlineRef.current = undefined
                  clearRememberedCampus()
                  setFilters({ ...DEFAULT_FILTERS })
                  setLocationSource('Default campus starting point (not your current location)')
                  setMinutes(15)
                  setNeeds([])
                  setNear('Leavey')
                  setNextClass(null)
                  setUscId(false)
                  setCalendar(false)
                  setDemo(false)
                  setPlanningTime(undefined)
                  setDemoTime(DEMO_TIME)
                  setDeadline(undefined)
                  setResult(null)
                  setLastRequest(null)
                  setError('')
                  setNotice('Preferences cleared on this device.')
                  sequence.current += 1
                  setBusy(false)
                  hasRun.current = false
                }}
              >
                <RotateCcw size={14} />
                Clear saved preferences
              </button>
            </details>
            <section className="calendar-demo" aria-label="Calendar demonstration">
              {adjust && !result && !busy && !error && !demo && (
                <button className="reset-demo-button" onClick={startDemo}>
                  Try the demo
                </button>
              )}
              {onSchedule && (
                <button onClick={onSchedule}>
                  Open My Schedule — manual, ICS &amp; screenshot import
                </button>
              )}
              <CalendarDays size={20} />
              <div>
                <h3>A break that fits your day</h3>
                <p>Preview free/busy availability. Simulated, with no sign-in.</p>
              </div>
              <button
                className="reset-link"
                aria-expanded={calendar}
                onClick={() => setCalendar(!calendar)}
              >
                {calendar ? 'Hide preview' : 'Preview calendar'}
              </button>
              {calendar && (
                <div className="calendar-preview">
                  <strong>Simulated calendar · not connected</strong>
                  <p>Sample only · no class titles or personal schedule.</p>
                  <ol>
                    <li>
                      <span>12:00–1:00 PM</span>Busy
                    </li>
                    <li>
                      <span>1:00–1:15 PM</span>Free · 15-minute break
                    </li>
                    <li>
                      <span>1:15–2:15 PM</span>Busy
                    </li>
                  </ol>
                  <button className="reset-link" onClick={startDemo}>
                    Try this sample break <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </section>
          </details>
        </section>
        <div className="reset-results-column">
          {link.notices.length > 0 && (
            <div className="reset-notice" role="status">
              {link.notices.map((value) => (
                <p key={value}>{value}</p>
              ))}
            </div>
          )}
          {error && (
            <div className="reset-error" role="alert">
              <strong>Let’s try another way.</strong>
              <p>
                Campus results aren’t available for these settings. Try the sample demo or change
                the starting point.
              </p>
              {onDirectory && (
                <button className="reset-link" onClick={onDirectory}>
                  Explore documented locations
                </button>
              )}
              {!demo && (
                <button className="reset-demo-button" onClick={startDemo}>
                  Try the demo
                </button>
              )}
              <details>
                <summary>Connection details</summary>
                <p>{error}</p>
              </details>
              <button className="reset-link" disabled={busy} onClick={() => void search()}>
                Retry connection
              </button>
            </div>
          )}
          {notice && (
            <p className="reset-notice" role="status">
              {notice}
            </p>
          )}
          {demo && (
            <section className="reset-demo-banner" aria-label="Demo mode">
              <strong>
                {result?.saved ? 'Saved demonstration (works offline)' : 'Demonstration mode'}
              </strong>
              <p>
                Illustrative amenities, access and hours at real mapped positions. Not scouted or
                live conditions.
              </p>
              <p>
                Fixed campus time: {timeLabel(demoTime)} Pacific ·{' '}
                {new Date(demoTime).toLocaleDateString('en-US', {
                  timeZone: 'America/Los_Angeles',
                })}
                .
              </p>
              <label className="reset-check">
                <input
                  type="checkbox"
                  checked={demoTime.includes('T21:')}
                  onChange={(e) => {
                    const value = e.target.checked ? '2026-10-19T21:00:00-07:00' : DEMO_TIME
                    setDemoTime(value)
                    setDeadline(undefined)
                    void search({ demo_time: value, deadline: undefined })
                  }}
                />
                Preview 9 PM · only verified after-dark spaces qualify
              </label>
              <button
                className="reset-link"
                onClick={() => {
                  setDemo(false)
                  const liveFilters = loadFilters()
                  setFilters(liveFilters)
                  setDemoTime(DEMO_TIME)
                  setDeadline(undefined)
                  void search({
                    demo: false,
                    filters: liveFilters,
                    demo_time: undefined,
                    deadline: undefined,
                  })
                }}
              >
                Back to current campus results
              </button>
              <button className="reset-link" onClick={startDemo}>
                Restart sample demo
              </button>
            </section>
          )}
          <section
            className="reset-results"
            aria-labelledby="places-title"
            aria-busy={busy}
            tabIndex={-1}
            ref={resultRef}
          >
            <div className="section-heading">
              <h2 id="places-title">
                {result ? 'Places for your pause' : 'A place to reset. A plan to get there.'}
              </h2>
              {result && <span>{recommendations.length} options</span>}
            </div>
            <div role="status" className="reset-status">
              {busy
                ? 'Checking walking time, access and your needs…'
                : result
                  ? `${recommendations.length} ${documented ? 'documented options; access unconfirmed' : 'eligible places'}. ${result.response.minutes} minutes remain in this break. Evaluated at ${timeLabel(result.response.evaluated_at)} Pacific.${result.saved ? ' Saved demonstration.' : ''}`
                  : 'Your recommendations will appear here.'}
            </div>
            {result && !recommendations.length && !busy && (
              <div className="reset-empty">
                <Leaf size={30} />
                <h3>No eligible spots for this break.</h3>
                <p>
                  {demo
                    ? 'Try more time, fewer needs, or daytime. Unknown safety, access and opening hours do not qualify.'
                    : "We're still confirming campus spaces."}
                </p>
                {!demo && onDirectory && (
                  <button onClick={onDirectory}>Explore documented locations</button>
                )}
              </div>
            )}
            {recommendations.length > 0 && (
              <>
                {documented && (
                  <div className="reset-notice">
                    <p>Indoor options. Check entry; times are provisional.</p>
                  </div>
                )}
                <ol className="reset-spot-list">
                  {[
                    selected ?? recommendations[0],
                    ...recommendations.filter(
                      (r) => r.spot.id !== (selected ?? recommendations[0]).spot.id,
                    ),
                  ].map((item, index) => (
                    <li key={item.spot.id} hidden={index > 0 && !showBackups}>
                      <SpotCard
                        item={item}
                        rank={index + 1}
                        selected={selectedId === item.spot.id}
                        evaluatedAt={result!.response.evaluated_at}
                        demo={result!.response.mode === 'demo'}
                        backupName={
                          recommendations.find((other) => other.spot.id === item.backup_id)?.spot
                            .name
                        }
                        busy={busy}
                        onSelect={() => {
                          setShowDirections(true)
                          setSelectedId(item.spot.id)
                          setRouteId(
                            item.route_to_spot?.recommended_id ??
                              item.route_to_class?.recommended_id ??
                              '',
                          )
                          setLeg(item.route_to_spot ? 'spot' : 'class')
                          requestAnimationFrame(() => {
                            routeRef.current?.focus({ preventScroll: true })
                            routeRef.current?.scrollIntoView({
                              behavior:
                                settings.lowSensory ||
                                window.matchMedia('(prefers-reduced-motion: reduce)').matches
                                  ? 'instant'
                                  : 'smooth',
                              block: 'start',
                            })
                          })
                        }}
                        onSwap={(reason) => void swap(item, reason)}
                      />
                    </li>
                  ))}
                </ol>
              </>
            )}
            {recommendations.length > 1 && (
              <button
                className="reset-link"
                aria-expanded={showBackups}
                onClick={() => setShowBackups(!showBackups)}
              >
                {showBackups
                  ? 'Hide backup options'
                  : `Backup options (${recommendations.length - 1})`}
              </button>
            )}
            {(result || error) && (
              <details className="reset-filter-adjust">
                <summary>Adjust · optional filters</summary>
                <SmartFilterControls value={filters} onChange={updateFilters} />
              </details>
            )}
            {(result || error) && suggestion && suggestion.id !== dismissedSuggestion && (
              <div className="context-suggestion">
                <p>{suggestion.text}</p>
                <button
                  className="reset-link"
                  onClick={() => {
                    if (suggestion.kind === 'between') {
                      quickSearch()
                    } else {
                      setAdjust(true)
                      updateFilters({
                        ...filters,
                        ...(suggestion.kind === 'lunch'
                          ? { activity: 'eat' as const }
                          : { evening_access: true }),
                      })
                    }
                  }}
                >
                  {suggestion.action}
                </button>
                <button
                  className="reset-link"
                  onClick={() => setDismissedSuggestion(suggestion.id)}
                  aria-label="Dismiss suggestion"
                >
                  Dismiss
                </button>
              </div>
            )}
            {!!result?.response.notes.length && (
              <details className="reset-data-notes">
                <summary>Data notes & limitations</summary>
                {result.response.notes.map((value) => (
                  <p key={value}>{value}</p>
                ))}
              </details>
            )}
          </section>
          {!demo && !error && (busy || result?.response.recommendations.length === 0) && (
            <section className="reset-demo-invite">
              <button className="reset-demo-button" onClick={startDemo}>
                Try the demo <ArrowRight size={15} />
              </button>
            </section>
          )}
          {showDirections && selected && !routeResult && (
            <section
              className="reset-route"
              ref={routeRef}
              tabIndex={-1}
              aria-label="Building location"
            >
              <h2>At this building’s mapped location</h2>
              <p>
                Your selected start is already at {selected.spot.name}’s approximate building
                anchor. Check the room and current entry rules. Indoor travel is not calculated; no
                outdoor route is needed for this leg.
              </p>
            </section>
          )}
          {showDirections && selected && routeResult && route && (
            <section
              className="reset-route"
              aria-labelledby="reset-route-title"
              ref={routeRef}
              tabIndex={-1}
            >
              <div className="section-heading">
                <h2 id="reset-route-title">{selected.spot.name} · walking directions</h2>
                <span>{Math.ceil(route.duration_min)} min walk</span>
              </div>
              <p className="reset-small">
                {leg === 'spot'
                  ? `From ${result!.response.origin.name} to your reset spot.`
                  : `From your reset spot to ${result!.response.next_class?.name}.`}{' '}
                {result?.response.next_class ? 'Leave the spot by' : 'Your rest window ends by'}{' '}
                {timeLabel(selected.leave_by)} Pacific.
                {result?.response.mode === 'demo' ? ' Demonstration route.' : ''}
              </p>
              {selected.route_to_class && (
                <div className="reset-chips" role="group" aria-label="Walking leg">
                  <button
                    aria-pressed={leg === 'spot'}
                    onClick={() => {
                      setLeg('spot')
                      setRouteId(selected.route_to_spot?.recommended_id ?? '')
                    }}
                  >
                    To reset spot
                  </button>
                  <button
                    aria-pressed={leg === 'class'}
                    onClick={() => {
                      setLeg('class')
                      setRouteId(selected.route_to_class!.recommended_id)
                    }}
                  >
                    To next class
                  </button>
                </div>
              )}
              <MapView
                origin={routeResult.snapped_origin}
                destination={routeResult.snapped_destination}
                result={routeResult}
                selected={route.id}
                onSelect={setRouteId}
                pickMode={null}
                setPickMode={() => {}}
                onPick={() => {}}
                stops={[]}
                showStops={false}
                features={features}
                navigationOnly
              />
              <div className="reset-route-choices" role="group" aria-label="Route options">
                {routeResult.routes.map((item) => (
                  <button
                    key={item.id}
                    aria-pressed={route.id === item.id}
                    onClick={() => setRouteId(item.id)}
                  >
                    {item.name} · {Math.ceil(item.duration_min)} min
                  </button>
                ))}
              </div>
              {route.id !== routeResult.recommended_id && (
                <p className="reset-small">
                  Rest time and leave-by use the recommended route. This alternative has a different
                  walking time.
                </p>
              )}
              <details className="reset-data-notes" open>
                <summary>Why this walk?</summary>
                <p>
                  {routeDescription(
                    route,
                    routeResult.routes.find((item) => item.roles.includes('fastest')),
                  )}
                </p>
                <p>
                  Road exposure is modeled from map geography. Crowd, sound and crossing delays are
                  not measured. Entrance offsets are excluded from walking time.
                </p>
                <ol>
                  {route.streets.map((street, i) => (
                    <li key={`${street}-${i}`}>{street}</li>
                  ))}
                </ol>
              </details>
              {backup && (
                <p className="reset-small">
                  Nearby backup: {backup.spot.name}. Select its card to see its walk.
                </p>
              )}
              {!kept && (
                <button
                  className="reset-link"
                  onClick={() => {
                    setKept(true)
                    recordFirstTry(selected.spot.id, 'kept')
                    setEvents((value) => ({
                      ...value,
                      [demo ? 'demoKept' : 'kept']: value[demo ? 'demoKept' : 'kept'] + 1,
                    }))
                  }}
                >
                  This spot works for me <Check size={14} />
                </button>
              )}
            </section>
          )}
          {selected && !selected.route_to_spot && !route && (
            <section
              className="reset-route"
              ref={routeRef}
              tabIndex={-1}
              aria-label="Already at reset spot"
            >
              <h2>{selected.spot.name}</h2>
              <p className="reset-small">
                You are already at this mapped point; no outdoor walking leg is needed. Indoor
                travel and access are unverified.
              </p>
              {selected.route_to_class && (
                <button
                  className="reset-link"
                  onClick={() => {
                    setLeg('class')
                    setRouteId(selected.route_to_class!.recommended_id)
                  }}
                >
                  Show walk to next class <ArrowRight size={14} />
                </button>
              )}
            </section>
          )}
          {events.kept + events.full + events.demoKept + events.demoFull > 0 && (
            <details className="reset-data-notes">
              <summary>Local session feedback</summary>
              {[
                { kept: events.kept, full: events.full, name: 'Current-campus' },
                { kept: events.demoKept, full: events.demoFull, name: 'Demonstration' },
              ]
                .filter((value) => value.kept + value.full > 0)
                .map((value) => (
                  <p key={value.name}>
                    {value.name}: {value.kept} accepted; {value.full} marked full.{' '}
                    {Math.round((value.kept / (value.kept + value.full)) * 100)}% accepted among
                    these button events. This browser view only; not measured product performance.
                  </p>
                ))}
            </details>
          )}
          {firstTries.kept + firstTries.full + firstTries.demoKept + firstTries.demoFull > 0 && (
            <details className="reset-data-notes">
              <summary>First recommendation feedback</summary>
              {[
                { kept: firstTries.kept, full: firstTries.full, name: 'Current-campus' },
                { kept: firstTries.demoKept, full: firstTries.demoFull, name: 'Demonstration' },
              ]
                .filter((value) => value.kept + value.full > 0)
                .map((value) => (
                  <p key={value.name}>
                    {value.name}: {value.kept} first suggestions accepted; {value.full} first
                    suggestions full. First-try acceptance:{' '}
                    {Math.round((value.kept / (value.kept + value.full)) * 100)}% among explicit
                    outcomes. Each search counts once; later swaps and unconfirmed visits are
                    excluded. Stored in this view only, not real-world product performance.
                  </p>
                ))}
            </details>
          )}
          <SupportFooter />
        </div>
      </div>
    </main>
  )
}
