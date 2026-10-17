import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Info, Leaf, LoaderCircle, Sparkles, X } from 'lucide-react'
import type { RouteRequest, RouteResponse } from '../types'
import { RouteCard } from './RouteCard'
import { api } from '../services/api'

export function Results({
  result,
  selected,
  onSelect,
  request,
  onClose,
}: {
  result: RouteResponse
  selected: string
  onSelect: (id: string) => void
  request: RouteRequest
  onClose: () => void
}) {
  const route = result.routes.find((r) => r.id === selected) ?? result.routes[0]
  const [explanation, setExplanation] = useState(route.explanation)
  const [mode, setMode] = useState('rule-based')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  useEffect(() => {
    sequence.current += 1
    setExplanation(route.explanation)
    setMode('rule-based')
    setError('')
    setBusy(false)
  }, [route])
  async function explain() {
    const current = ++sequence.current
    setBusy(true)
    setError('')
    try {
      const answer = await api<{ explanation: string; mode: string }>('/ai/explain', {
        request,
        route_id: route.id,
      })
      if (current === sequence.current) {
        setExplanation(answer.explanation)
        setMode(answer.mode)
      }
    } catch (e) {
      if (current === sequence.current) setError((e as Error).message)
    } finally {
      if (current === sequence.current) setBusy(false)
    }
  }
  return (
    <aside className="results" aria-label="Route comparison">
      <div className="results-heading">
        <div>
          <div className="eyebrow">YOUR OPTIONS</div>
          <h2>A way that works for you.</h2>
        </div>
        <button className="icon-button" aria-label="Close route results" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <p className="results-intro">Estimated walking time · choose a route to explore.</p>
      <div className="route-list">
        {result.routes.map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            selected={selected === route.id}
            recommended={result.recommended_id === route.id}
            onSelect={() => onSelect(route.id)}
          />
        ))}
      </div>
      {result.routes.length === 1 && (
        <p className="notice">
          <Info size={16} />
          No substantially different calmer alternative was found within your detour limit.
        </p>
      )}
      <section className="route-breakdown">
        <h3>
          A closer look <span>Modeled indices</span>
        </h3>
        {(
          [
            { key: 'noise', name: 'Noise-related proxy' },
            { key: 'traffic', name: 'Traffic exposure' },
            { key: 'green', name: 'Green-space proximity' },
          ] as const
        ).map(({ key, name }) => (
          <div key={key}>
            <label>
              {name}
              <span>
                {route.breakdown[key] === null ? 'Unavailable' : `${route.breakdown[key]}/100`}
              </span>
            </label>
            <div className={`metric-track ${key}`}>
              <i style={{ width: `${route.breakdown[key] ?? 0}%` }} />
            </div>
          </div>
        ))}
        <p>Crowd data unavailable · not included in scores.</p>
      </section>
      <section className="explanation">
        <div className="section-heading">
          <h3>
            <Sparkles size={15} />
            Why this walk?
          </h3>
          <span className="mode-label">{mode}</span>
        </div>
        <p>{explanation}</p>
        <button disabled={busy} className="text-button" onClick={() => void explain()}>
          {busy ? <LoaderCircle size={14} className="spin" /> : <ArrowUpRight size={14} />}Explain
          the tradeoff
        </button>
        {error && (
          <p role="alert" className="error-inline">
            {error}
          </p>
        )}
      </section>
      <details className="path-details">
        <summary>Walking path & data notes</summary>
        <ol>
          {route.streets.map((street, i) => (
            <li key={`${street}-${i}`}>{street}</li>
          ))}
        </ol>
        <p>
          Start snapped {result.origin_snap_m.toFixed(0)} m; destination snapped{' '}
          {result.destination_snap_m.toFixed(0)} m. These offsets are not verified entrance paths
          and are excluded from distance/time.
        </p>
        <p>
          {route.confidence}. {route.major_road_m.toFixed(0)} m on major-road segments.
        </p>
        {result.notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </details>
      <div className="results-footer">
        <Leaf size={15} />A different route. A little more choice.
      </div>
    </aside>
  )
}
