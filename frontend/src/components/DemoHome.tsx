import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Footprints, Leaf, RotateCcw } from 'lucide-react'
import type { FeatureCollection } from 'geojson'
import { DEFAULTS } from '../preferences'
import { DEMO_TIME, parseDeepLink, timeLabel, type Need, type Recommendation } from '../respite'
import { homeRecommendations } from '../services/homeRecommendations'
import { resolveDemoLocation } from '../services/demoJourney'
import { CampusLocationPicker } from './CampusLocationPicker'
import { readSchedule } from '../calendar/storage'
import { scheduleContext } from '../smartContext'
import { MapView } from './MapView'
import { BreakTimeControls } from './BreakTimeControls'
import { LocationPhoto, PhotoCredit } from './LocationPhoto'
import '../demo-home.css'

// Replay the existing engine's saved two-leg routes, not invented campus observations.
function demoResult(
  minutes: number,
  clock: string,
  deadline: string | undefined,
  needs: Need[],
  near = 'Leavey Library',
  nextClass: string | null = null,
) {
  return (
    homeRecommendations({
      near,
      next_class: nextClass,
      minutes,
      needs,
      demo: true,
      demo_time: clock,
      deadline,
      usc_id: false,
      preferences: { ...DEFAULTS },
    }) ?? undefined
  )
}

const PREFERENCES: { id: Need; label: string }[] = [
  { id: 'indoor', label: 'Indoors' },
  { id: 'outdoor', label: 'Outdoors' },
  { id: 'quiet', label: 'Quiet' },
  { id: 'seated', label: 'Place to sit' },
  { id: 'dim', label: 'Lower light' },
  { id: 'few_people', label: 'Fewer people' },
]

const nameOf = (item: Recommendation) => item.spot.name.replace(/\s*\(sample\)$/, '')
function description(item: Recommendation) {
  if (item.spot.indoor)
    return 'An indoor option for your pause. Entry and conditions are simulated in this demo.'
  if (item.spot.name.includes('Hutton')) return 'A little green space for a pause between classes.'
  if (item.spot.name.includes('Associates'))
    return 'A change of scenery, with your next stop close by.'
  return 'Room to take a breath and enjoy a slower moment outside.'
}

export function DemoHome({
  features,
  onLive,
}: {
  features: FeatureCollection | null
  onLive: () => void
}) {
  const [linked] = useState(() =>
    new URLSearchParams(window.location.search).get('home') === '1'
      ? parseDeepLink(window.location.search)
      : null,
  )
  const [minutes, setMinutes] = useState(linked?.minutes ?? 15)
  const [clock, setClock] = useState(linked?.demo_time ?? DEMO_TIME)
  const [deadline, setDeadline] = useState<string | undefined>(linked?.deadline)
  const [needs, setNeeds] = useState<Need[]>(linked?.needs ?? [])
  const [near, setNear] = useState(() =>
    linked?.near
      ? (resolveDemoLocation(linked.near)?.name ??
        (typeof linked.near === 'string' ? linked.near : `${linked.near.lat},${linked.near.lon}`))
      : 'Leavey Library',
  )
  const [nextClass, setNextClass] = useState<string | null>(() =>
    linked?.next
      ? (resolveDemoLocation(linked.next)?.name ??
        (typeof linked.next === 'string' ? linked.next : `${linked.next.lat},${linked.next.lon}`))
      : null,
  )
  const [nearText, setNearText] = useState(linked?.near ? near : '')
  const [nextText, setNextText] = useState(linked?.next ? (nextClass ?? '') : '')
  const [formRevision, setFormRevision] = useState(0)
  const [savedClass, setSavedClass] = useState<ReturnType<typeof scheduleContext>>(null)
  const [startingDefault, setStartingDefault] = useState(!linked?.near)
  const [fromSchedule, setFromSchedule] = useState(false)
  const edited = useRef(Boolean(linked))
  const DEMO = demoResult(minutes, clock, deadline, needs, near, nextClass)
  const [skipped, setSkipped] = useState<string[]>([])
  const [offset, setOffset] = useState(0)
  const [walking, setWalking] = useState<Recommendation | null>(null)
  const [leg, setLeg] = useState<'spot' | 'class'>('spot')
  const [routeId, setRouteId] = useState('')
  const [notice, setNotice] = useState('')
  const optionsRef = useRef<HTMLElement>(null)
  const routeRef = useRef<HTMLElement>(null)
  const options = (DEMO?.recommendations ?? []).filter((item) => !skipped.includes(item.spot.id))
  const ordered = options.length
    ? [
        ...options.slice(offset % options.length),
        ...options.slice(0, offset % options.length),
      ].slice(0, 3)
    : []
  const route = walking ? (leg === 'spot' ? walking.route_to_spot : walking.route_to_class) : null
  const selected =
    route?.routes.find((item) => item.id === routeId) ??
    route?.routes.find((item) => item.id === route.recommended_id)

  useEffect(() => {
    if (!linked?.to) return
    const item = DEMO?.recommendations.find((candidate) => candidate.spot.id === linked.to)
    if (item) startWalk(item)
    // Restore an explicitly shared home route once, not after manual changes.
  }, [linked])

  useEffect(() => {
    let active = true
    void readSchedule()
      .then((events) => {
        if (!active || edited.current) return
        const now = new Date().toISOString()
        const context = scheduleContext(events, now)
        if (!context) return
        setSavedClass(context)
      })
      .catch(() => {
        /* Local schedule is optional; never block the immediate demo. */
      })
    return () => {
      active = false
    }
  }, [])

  function focusOptions() {
    requestAnimationFrame(() => {
      optionsRef.current?.focus({ preventScroll: true })
      optionsRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
    })
  }
  function startWalk(item: Recommendation) {
    edited.current = true
    setWalking(item)
    setLeg(item.route_to_spot || !item.route_to_class ? 'spot' : 'class')
    setRouteId(item.route_to_spot?.recommended_id ?? item.route_to_class?.recommended_id ?? '')
    requestAnimationFrame(() => {
      routeRef.current?.focus({ preventScroll: true })
      routeRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
    })
  }
  function skip(item: Recommendation) {
    edited.current = true
    setSkipped([...skipped, item.spot.id])
    setOffset(0)
    setWalking(null)
    setNotice(
      `${nameOf(item)} is skipped for this demo. ${options.length > 1 ? 'Here’s another option. Your end time stays the same.' : 'You’ve tried all matching sample spots. Restart whenever you like.'}`,
    )
    focusOptions()
  }

  function applyWindow(window: { minutes: number; now: string; deadline: string }, focus = false) {
    const start = resolveDemoLocation(nearText.trim() || 'Leavey Library')
    const destination = nextText.trim() ? resolveDemoLocation(nextText) : null
    if (!start || destination === undefined)
      throw new Error(
        'Choose a listed campus location, or leave the field blank to use the labeled sample starting point.',
      )
    if (
      !demoResult(
        window.minutes,
        window.now,
        window.deadline,
        needs,
        start.name,
        destination?.name ?? null,
      )
    )
      throw new Error(
        'Choose another campus location. No saved walking route connects these buildings.',
      )
    const changed =
      near !== start.name ||
      nextClass !== (destination?.name ?? null) ||
      minutes !== window.minutes ||
      Date.parse(clock) !== Date.parse(window.now) ||
      Date.parse(deadline ?? new Date(Date.parse(clock) + minutes * 60000).toISOString()) !==
        Date.parse(window.deadline)
    if (!focus && !changed) return
    edited.current = true
    setNear(start.name)
    setNextClass(destination?.name ?? null)
    setNearText(nearText.trim() ? start.name : '')
    setNextText(destination?.name ?? '')
    setStartingDefault(!nearText.trim())
    setFromSchedule(false)
    setMinutes(window.minutes)
    setClock(window.now)
    setDeadline(window.deadline)
    setSkipped([])
    setOffset(0)
    setWalking(null)
    setNotice('Options updated for your time window.')
    if (focus) focusOptions()
  }

  return (
    <main id="campus-content" className="demo-home">
      <section className="demo-hero" aria-labelledby="demo-title">
        <div>
          <p className="demo-eyebrow">
            <Leaf size={17} aria-hidden="true" /> A LITTLE ROOM IN YOUR DAY
          </p>
          <h1 id="demo-title">
            A breather.
            <br />
            Not another decision.
          </h1>
        </div>
        <aside
          className="demo-context"
          aria-label="Sample break, not your actual schedule or location"
        >
          <BreakTimeControls
            key={formRevision}
            minutes={minutes}
            clock={clock}
            deadline={deadline}
            submitLabel="Find me a spot"
            onEdit={() => {
              edited.current = true
            }}
            onPreview={(window) => applyWindow(window)}
            onWindow={(window) => applyWindow(window, true)}
          >
            <div className="demo-location-fields">
              <CampusLocationPicker
                label="Starting from"
                value={nearText}
                onChange={(value) => {
                  edited.current = true
                  setNearText(value)
                }}
              />
              <CampusLocationPicker
                label="Next class / destination"
                value={nextText}
                onChange={(value) => {
                  edited.current = true
                  setNextText(value)
                }}
              />
              {savedClass && (
                <button
                  type="button"
                  className="demo-text-button"
                  onClick={() => {
                    const now = new Date().toISOString()
                    const remaining = Math.floor(
                      (Date.parse(savedClass.deadline) - Date.parse(now)) / 60000,
                    )
                    if (remaining <= 0) {
                      setNotice('That class has already started. Choose a new time window.')
                      return
                    }
                    const destination =
                      resolveDemoLocation(savedClass.next_class)?.name ?? savedClass.next_class
                    edited.current = true
                    setNextText(destination)
                    setNextClass(destination)
                    setMinutes(remaining)
                    setClock(now)
                    setDeadline(savedClass.deadline)
                    setFromSchedule(true)
                    setFormRevision((value) => value + 1)
                    setWalking(null)
                  }}
                >
                  Use saved next class: {savedClass.next_class}
                </button>
              )}
            </div>
          </BreakTimeControls>
          <small>
            {startingDefault
              ? 'Default starting point—not your current location. '
              : 'Selected campus locations, not live GPS. '}
            {fromSchedule
              ? 'Next destination from your saved schedule.'
              : startingDefault
                ? 'Sample picks start at Leavey until you choose a location. Next destination is optional.'
                : 'Next destination is optional.'}
          </small>
        </aside>
      </section>

      {walking && !route && (
        <section
          className="demo-directions"
          ref={routeRef}
          tabIndex={-1}
          aria-labelledby="demo-zero-walk-title"
        >
          <h2 id="demo-zero-walk-title">No outdoor walk needed.</h2>
          <p>
            {leg === 'spot'
              ? `You’re already at the approximate building location for ${nameOf(walking)}.`
              : 'Your spot and next destination share the same approximate building location.'}{' '}
            Indoor travel is not included.
          </p>
          <button
            className="demo-text-button"
            onClick={() => {
              setWalking(null)
              focusOptions()
            }}
          >
            Back to spots
          </button>
          {leg === 'spot' && walking.route_to_class && (
            <button
              className="demo-text-button"
              onClick={() => {
                setLeg('class')
                setRouteId('')
                requestAnimationFrame(() => routeRef.current?.focus())
              }}
            >
              Next destination
            </button>
          )}
          {leg === 'class' && walking.route_to_spot && (
            <button
              className="demo-text-button"
              onClick={() => {
                setLeg('spot')
                setRouteId('')
                requestAnimationFrame(() => routeRef.current?.focus())
              }}
            >
              To your spot
            </button>
          )}
        </section>
      )}
      {walking && route && (
        <section
          className="demo-directions"
          ref={routeRef}
          tabIndex={-1}
          aria-labelledby="demo-route-title"
        >
          <button
            className="demo-text-button"
            onClick={() => {
              setWalking(null)
              focusOptions()
            }}
          >
            <ArrowLeft size={16} aria-hidden="true" /> Back to spots
          </button>
          <h2 id="demo-route-title">
            {leg === 'spot'
              ? `Let’s walk to ${nameOf(walking)}.`
              : `On to ${DEMO?.next_class?.name ?? nextClass}.`}
          </h2>
          {walking.walk_to_min === 0 && (
            <p>
              You’re already at the approximate building location for {nameOf(walking)}. Indoor
              travel is not included.
              {nextClass ? ' The map below shows your next-destination walk.' : ''}
            </p>
          )}
          <p>
            {leg === 'spot'
              ? `Start at ${DEMO?.origin.name ?? near}. About ${walking.walk_to_min} minutes on foot.`
              : `Leave by ${timeLabel(walking.leave_by)}. About ${walking.walk_to_class_min} minutes on foot.`}{' '}
            Saved map route · sample break.
          </p>
          <div className="demo-route-tabs" aria-label="Journey leg">
            <button
              aria-pressed={leg === 'spot'}
              onClick={() => {
                setLeg('spot')
                setRouteId('')
              }}
            >
              To your spot
            </button>
            {nextClass && (
              <button
                aria-pressed={leg === 'class'}
                onClick={() => {
                  setLeg('class')
                  setRouteId('')
                }}
              >
                Next destination
              </button>
            )}
          </div>
          <div className="demo-map">
            <MapView
              origin={route.snapped_origin}
              destination={route.snapped_destination}
              result={route}
              selected={selected?.id ?? route.recommended_id}
              onSelect={setRouteId}
              pickMode={null}
              setPickMode={() => {}}
              onPick={() => {}}
              stops={[]}
              showStops={false}
              features={features}
              navigationOnly
            />
          </div>
          <p className="demo-route-summary">
            <Footprints size={18} aria-hidden="true" /> {selected?.name} · about{' '}
            {Math.ceil(selected?.duration_min ?? 0)} min · {Math.round(selected?.distance_m ?? 0)} m
          </p>
          {selected?.streets.length ? (
            <p className="demo-streets">Mapped paths: {selected.streets.join(' → ')}</p>
          ) : null}
          <details className="demo-route-alternatives">
            <summary>Other walking routes</summary>
            {route.routes.length === 1 && route.routes[0].roles.length > 1 && (
              <p className="demo-map-note">
                Fastest, calmer, and balanced use the same path for this short walk.
              </p>
            )}
            <div className="demo-route-tabs">
              {route.routes.map((item) => (
                <button
                  key={item.id}
                  aria-pressed={item.id === selected?.id}
                  onClick={() => setRouteId(item.id)}
                >
                  {item.name} · {Math.ceil(item.duration_min)} min
                </button>
              ))}
            </div>
          </details>
          <p className="demo-map-note">
            The route line and text work without map tiles. No live navigation or verified access
            conditions.
          </p>
          {route.notes.some((note) => note.includes('not a verified entrance')) && (
            <details className="demo-route-alternatives">
              <summary>Building approach &amp; entrance limits</summary>
              {route.notes
                .filter((note) => note.includes('not a verified entrance'))
                .map((note) => (
                  <p key={note} className="demo-map-note">
                    {note}
                  </p>
                ))}
            </details>
          )}
        </section>
      )}

      <section
        className="demo-options"
        ref={optionsRef}
        tabIndex={-1}
        aria-labelledby="demo-options-title"
      >
        <div className="demo-options-heading">
          <div>
            <p className="demo-eyebrow">YOUR PAUSE, ALREADY PICKED</p>
            <h2 id="demo-options-title">
              {ordered.length ? 'Somewhere to reset.' : 'A fresh start?'}
            </h2>
          </div>
          {ordered.length > 1 && (
            <button
              className="demo-text-button"
              onClick={() => {
                setOffset(offset + 1)
                edited.current = true
                setWalking(null)
                setNotice('Another sample pick is first. Your end time stays the same.')
                focusOptions()
              }}
            >
              <RotateCcw size={15} aria-hidden="true" /> Show another pick
            </button>
          )}
        </div>
        <div className="reset-chips demo-preferences" role="group" aria-label="Spot preferences">
          {PREFERENCES.map(({ id, label }) => (
            <button
              key={id}
              aria-pressed={id === 'outdoor' ? !needs.includes('indoor') : needs.includes(id)}
              onClick={() => {
                edited.current = true
                setNeeds(
                  id === 'indoor' || id === 'outdoor'
                    ? [...needs.filter((need) => need !== 'indoor' && need !== 'outdoor'), id]
                    : needs.includes(id)
                      ? needs.filter((need) => need !== id)
                      : [...needs, id],
                )
                setOffset(0)
                setWalking(null)
                setNotice('Preferences updated.')
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="demo-applied-journey">
          {near}{' '}
          {nextClass
            ? `→ ${nextClass}`
            : '· No next destination. Onward walking time is not included; rest time is provisional.'}
        </p>
        <p className="demo-status" role="status">
          {notice}
        </p>
        <div className="demo-cards">
          {ordered.map((item, index) => (
            <article
              key={item.spot.id}
              className={`demo-spot ${index === 0 ? 'demo-best' : ''}`}
              aria-labelledby={`demo-${item.spot.id}`}
            >
              <div className="demo-photo-wrap">
                <LocationPhoto place={item.spot} />
                {index === 0 && <span className="demo-photo-pick">Your best pick</span>}
              </div>
              <div className="demo-spot-body">
                <p className="demo-spot-type">
                  {item.spot.indoor ? 'INDOOR' : 'OUTDOOR'} PAUSE · SAMPLE
                </p>
                <h3 id={`demo-${item.spot.id}`}>{nameOf(item)}</h3>
                <div className="demo-metrics">
                  <span>
                    <Footprints size={18} aria-hidden="true" />
                    <strong>{item.walk_to_min} min</strong> walk
                  </span>
                  <span>
                    <Leaf size={18} aria-hidden="true" />
                    <strong>{item.rest_min} min</strong> to reset
                  </span>
                </div>
                <p className="demo-leave">
                  {nextClass ? 'Leave by ' : 'Rest until '}
                  <strong>{timeLabel(item.leave_by)}</strong>
                  {nextClass ? ' for your next destination.' : ' · provisional'}
                </p>
                <button
                  className={index === 0 ? 'primary-button demo-walk' : 'demo-walk demo-secondary'}
                  onClick={() => startWalk(item)}
                >
                  Walk me there <ArrowRight size={17} aria-hidden="true" />
                </button>
                <button className="demo-full" onClick={() => skip(item)}>
                  It’s full
                </button>
                <details className="location-more">
                  <summary>More info</summary>
                  <p>{item.why[0]}</p>
                  <p>{description(item)}</p>
                  <PhotoCredit place={item.spot} />
                </details>
              </div>
            </article>
          ))}
        </div>
        {!ordered.length && (
          <div className="demo-restart">
            <p>
              {DEMO
                ? DEMO.recommendations.length
                  ? 'All matching sample spots have been skipped. You can replay the demo in one tap.'
                  : 'No sample spot fits. Try a daytime break or fewer preferences.'
                : 'No saved route for these locations. Choose another campus location or use the live tools below.'}
            </p>
            {DEMO && (
              <button
                className="primary-button"
                onClick={() => {
                  setSkipped([])
                  setOffset(0)
                  edited.current = true
                  if (!DEMO.recommendations.length) {
                    setMinutes(15)
                    setClock(DEMO_TIME)
                    setDeadline(undefined)
                    setNeeds([])
                    setFormRevision((value) => value + 1)
                  }
                  setNotice('Demo restarted. Sample spots are ready.')
                  focusOptions()
                }}
              >
                {DEMO.recommendations.length ? 'Restart demo' : 'Reset demo'}{' '}
                <RotateCcw size={17} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </section>
      <div className="demo-disclosure">
        <Leaf size={20} aria-hidden="true" />
        <div>
          <strong>Sample conditions, not live observations.</strong>
          <p>
            Real places and saved routes. Lighting, seating, quietness, and crowd levels are
            simulated.
          </p>
          <button className="demo-text-button" onClick={onLive}>
            Use live reset tools <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </main>
  )
}
