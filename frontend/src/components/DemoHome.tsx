import { useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Footprints,
  Leaf,
  MapPin,
  RotateCcw,
  Trees,
} from 'lucide-react'
import type { FeatureCollection } from 'geojson'
import { DEFAULTS } from '../preferences'
import { DEMO_TIME, timeLabel, type Recommendation } from '../respite'
import { savedDemo } from '../services/respiteApi'
import { MapView } from './MapView'
import { BreakTimeControls } from './BreakTimeControls'
import { LocationPhoto, PhotoCredit } from './LocationPhoto'
import '../demo-home.css'

// Replay the existing engine's saved two-leg routes, not invented campus observations.
function demoResult(minutes: number, clock: string, deadline: string | undefined, indoor: boolean) {
  return savedDemo({
    near: 'Leavey',
    next_class: 'TCC',
    minutes,
    needs: indoor ? ['indoor'] : [],
    demo: true,
    demo_time: clock,
    deadline,
    usc_id: false,
    preferences: { ...DEFAULTS },
  })?.response
}

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
  const [minutes, setMinutes] = useState(15)
  const [clock, setClock] = useState(DEMO_TIME)
  const [deadline, setDeadline] = useState<string | undefined>()
  const [indoor, setIndoor] = useState(false)
  const DEMO = demoResult(minutes, clock, deadline, indoor)
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
    ? [...options.slice(offset % options.length), ...options.slice(0, offset % options.length)]
    : []
  const route = walking ? (leg === 'spot' ? walking.route_to_spot : walking.route_to_class) : null
  const selected =
    route?.routes.find((item) => item.id === routeId) ??
    route?.routes.find((item) => item.id === route.recommended_id)

  function focusOptions() {
    requestAnimationFrame(() => {
      optionsRef.current?.focus({ preventScroll: true })
      optionsRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
    })
  }
  function startWalk(item: Recommendation) {
    setWalking(item)
    setLeg(item.route_to_spot ? 'spot' : 'class')
    setRouteId(item.route_to_spot?.recommended_id ?? item.route_to_class?.recommended_id ?? '')
    requestAnimationFrame(() => {
      routeRef.current?.focus({ preventScroll: true })
      routeRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
    })
  }
  function skip(item: Recommendation) {
    setSkipped([...skipped, item.spot.id])
    setOffset(0)
    setWalking(null)
    setNotice(
      `${nameOf(item)} is skipped for this demo. ${options.length > 1 ? 'Here’s another option. Your class time stays the same.' : 'You’ve tried all three sample spots. Restart whenever you like.'}`,
    )
    focusOptions()
  }

  return (
    <main id="campus-content" className="demo-home">
      <div className="showcase-label">
        <span /> Presentation demo · sample conditions
      </div>
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
          <p className="demo-intro">
            A few minutes to yourself, and a simple way to get there. We’ve picked three spots for
            your next pause.
          </p>
          <button
            className="primary-button demo-find"
            onClick={() => {
              setWalking(null)
              if (!options.length) {
                setSkipped([])
                if (!DEMO?.recommendations.length) {
                  setMinutes(15)
                  setClock(DEMO_TIME)
                  setDeadline(undefined)
                  setNotice('Restarted the 15-minute afternoon sample.')
                }
              }
              focusOptions()
            }}
          >
            Find me a spot <ArrowRight size={19} aria-hidden="true" />
          </button>
          <p className="demo-no-setup">No questions. No account. Just a little space.</p>
        </div>
        <aside
          className="demo-context"
          aria-label="Sample break, not your actual schedule or location"
        >
          <div className="demo-context-icon">
            <Trees size={35} aria-hidden="true" />
          </div>
          <p className="demo-eyebrow">LET’S TRY A CAMPUS BREAK</p>
          <strong>{minutes} minutes, just for you.</strong>
          <p>
            <MapPin size={16} aria-hidden="true" /> Starting at Leavey Library
          </p>
          <p>
            <Clock3 size={16} aria-hidden="true" /> Next stop: Tutor Campus Center at{' '}
            {timeLabel(
              DEMO?.deadline ?? new Date(Date.parse(clock) + minutes * 60000).toISOString(),
            )}
          </p>
          <small>Sample starting point and class. Not your location or calendar.</small>
        </aside>
      </section>

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
            {leg === 'spot' ? `Let’s walk to ${nameOf(walking)}.` : 'On to Tutor Campus Center.'}
          </h2>
          {walking.walk_to_min === 0 && (
            <p>
              You’re already at the approximate building location for {nameOf(walking)}. Indoor
              travel is not included. The map below shows your next-class walk.
            </p>
          )}
          <p>
            {leg === 'spot'
              ? `Start at Leavey Library. About ${walking.walk_to_min} minutes on foot.`
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
            <button
              aria-pressed={leg === 'class'}
              onClick={() => {
                setLeg('class')
                setRouteId('')
              }}
            >
              Then to class
            </button>
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
                setWalking(null)
                setNotice('Another sample pick is first. Your class time stays the same.')
                focusOptions()
              }}
            >
              <RotateCcw size={15} aria-hidden="true" /> Show another pick
            </button>
          )}
        </div>
        <details className="demo-adjust">
          <summary>Change preferences · time &amp; indoor options</summary>
          <BreakTimeControls
            minutes={minutes}
            clock={clock}
            onPreset={(value) => {
              setMinutes(value)
              setDeadline(undefined)
              setWalking(null)
              setNotice('Time updated. Sample options are ready.')
            }}
            onWindow={(window) => {
              setMinutes(window.minutes)
              setClock(window.now)
              setDeadline(window.deadline)
              setWalking(null)
              setNotice('Break calculated from your selected times. Sample conditions still apply.')
            }}
          />
          <div className="reset-chips" role="group" aria-label="Sample setting">
            <button
              aria-pressed={!indoor}
              onClick={() => {
                setIndoor(false)
                setWalking(null)
              }}
            >
              Outdoors
            </button>
            <button
              aria-pressed={indoor}
              onClick={() => {
                setIndoor(true)
                setWalking(null)
              }}
            >
              Indoors
            </button>
          </div>
        </details>
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
                  Leave by <strong>{timeLabel(item.leave_by)}</strong> for your sample class.
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
                  ? 'All three sample spots have been skipped. You can replay the demo in one tap.'
                  : 'No sample spot fits this time window. Try more time or a daytime break.'
                : 'The saved demo is unavailable in this build. The live tools are still available below.'}
            </p>
            {DEMO && (
              <button
                className="primary-button"
                onClick={() => {
                  setSkipped([])
                  setOffset(0)
                  if (!DEMO.recommendations.length) {
                    setMinutes(15)
                    setClock(DEMO_TIME)
                    setDeadline(undefined)
                  }
                  setNotice('Demo restarted. All three sample spots are ready.')
                  focusOptions()
                }}
              >
                {DEMO.recommendations.length ? 'Restart demo' : 'Reset to 15-minute demo'}{' '}
                <RotateCcw size={17} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </section>
      <div className="demo-disclosure">
        <Leaf size={20} aria-hidden="true" />
        <div>
          <strong>A simple demo, not a live promise.</strong>
          <p>
            Real campus places and saved walking paths. Quietness, availability, and this break are
            illustrative—not verified observations. This demo works without the campus server.
          </p>
          <button className="demo-text-button" onClick={onLive}>
            Use live reset tools <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </main>
  )
}
