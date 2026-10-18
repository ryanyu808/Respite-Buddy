import { useState, useEffect } from 'react'
import records from '../data/campus-candidates.json'
import type { Point } from '../types'
import { SmartFilterControls } from './SmartFilterControls'
import {
  loadFilters,
  saveFilters,
  matchesFilters,
  attributeState,
  DEFAULT_FILTERS,
  type DirectorySpot,
} from '../smartFilters'
import { api } from '../services/api'
import { rememberedCampus, rememberCampus } from '../smartContext'
export function CampusDirectory({
  onWalk,
  onDemo,
}: {
  onWalk: (point: Point) => void
  onDemo: () => void
}) {
  const [query, setQuery] = useState(''),
    [kind, setKind] = useState('all')
  const [filters, setFilters] = useState(loadFilters)
  const [origin, setOrigin] = useState(rememberedCampus() ?? 'Leavey Library')
  const [walking, setWalking] = useState<DirectorySpot[] | null>(null)
  const [walkNotice, setWalkNotice] = useState('')
  useEffect(() => {
    saveFilters(filters)
  }, [filters])
  useEffect(() => {
    let cancelled = false
    setWalking(null)
    setWalkNotice('')
    if (filters.max_walk_min !== null) {
      setWalkNotice('Checking mapped walking times…')
      api<{ places: DirectorySpot[] }>('/campus-candidates/filter', { near: origin, filters })
        .then((value) => {
          if (!cancelled) {
            setWalking(value.places)
            setWalkNotice(
              'Walking times use the existing campus router; indoor travel is excluded.',
            )
          }
        })
        .catch(() => {
          if (!cancelled) {
            setWalking([])
            setWalkNotice(
              'Walking times are unavailable. Clear the walking limit to browse places; no distance was guessed.',
            )
          }
        })
    }
    return () => {
      cancelled = true
    }
  }, [filters, origin])
  const source: DirectorySpot[] =
    filters.max_walk_min !== null ? (walking ?? []) : (records as unknown as DirectorySpot[])
  const filtered = source.filter(
    (p) =>
      `${p.name} ${p.building} ${p.building_code}`.toLowerCase().includes(query.toLowerCase()) &&
      (kind === 'all' || p.indoor === (kind === 'indoor')) &&
      matchesFilters(p, filters, new Date().toISOString(), p.walk_min),
  )
  if (filters.activity === 'study')
    filtered.sort(
      (a, b) =>
        Number(b.amenities?.some((v) => v.toLowerCase().includes('study')) ?? false) -
        Number(a.amenities?.some((v) => v.toLowerCase().includes('study')) ?? false),
    )
  return (
    <main className="campus-page" id="campus-content" tabIndex={-1}>
      <div className="eyebrow">EXPLORE, WITH CONTEXT</div>
      <h1>A little space around campus.</h1>
      <p className="page-intro">
        Documented places to explore, not verified reset recommendations. Current noise, crowds,
        opening hours, entry rules and step-free access remain unconfirmed.
      </p>
      <div className="calendar-notice">
        <strong>
          {records.length} documented or mapped candidates · 0 scout verifications added
        </strong>
        <p>
          Room routes end at an approximate building anchor, not the room or a verified entrance.
          Check the source and current campus rules before visiting. No after-dark suitability is
          implied.
        </p>
        <button onClick={onDemo}>Try the sample demo</button>
      </div>
      <details>
        <summary>Adjust · optional filters</summary>
        <SmartFilterControls value={filters} onChange={setFilters} />
        <label className="reset-field directory-origin">
          Campus starting point for walking estimates
          <input
            value={origin}
            onChange={(e) => {
              setOrigin(e.target.value)
              rememberCampus(e.target.value)
            }}
          />
        </label>
        <p>Selected campus point, not your live location.</p>
      </details>
      {walkNotice && <p role="status">{walkNotice}</p>}
      <div className="form-grid">
        <label>
          Search campus spaces
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="A room, library or building code"
          />
        </label>
        <label>
          Setting
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">All settings</option>
            <option value="indoor">Indoor</option>
            <option value="outdoor">Outdoor</option>
          </select>
        </label>
      </div>
      <p role="status">
        {filtered.length} matching spaces. This directory is bundled for use while the server wakes.
      </p>
      <div className="candidate-grid">
        {filtered.map((p) => (
          <article className="candidate-card" key={p.id}>
            <span className="candidate-status">
              {p.provenance?.[0].source_type === 'OpenStreetMap snapshot'
                ? 'Mapped potential location'
                : 'USC documented — conditions unconfirmed'}
            </span>
            <h2>{p.name}</h2>
            <p>
              {p.building ?? 'Outdoor mapped space'}
              {p.floor ? ` · Floor ${p.floor}` : ''} ·{' '}
              {p.indoor == null ? 'Indoor/outdoor unconfirmed' : p.indoor ? 'Indoor' : 'Outdoor'}
            </p>
            <dl>
              <dt>Documented amenities</dt>
              <dd>{p.amenities?.join(' · ') || 'No amenity claims confirmed'}</dd>
              <dt>Outlets</dt>
              <dd>
                {attributeState(p, 'outlets') === 'present'
                  ? 'Documented present'
                  : attributeState(p, 'outlets') === 'absent'
                    ? 'Confirmed absent'
                    : 'Unknown'}
              </dd>
              <dt>Food for purchase</dt>
              <dd>
                {attributeState(p, 'food_available') === 'present'
                  ? 'Documented venue; current service unconfirmed'
                  : attributeState(p, 'food_available') === 'absent'
                    ? 'Confirmed absent'
                    : 'Unknown'}
              </dd>
              <dt>Food allowed</dt>
              <dd>
                {attributeState(p, 'food_allowed') === 'present'
                  ? 'Documented permission'
                  : attributeState(p, 'food_allowed') === 'absent'
                    ? 'Confirmed not allowed'
                    : 'Unknown — not implied by food sales'}
              </dd>
              {p.venue_kind && (
                <>
                  <dt>Venue type</dt>
                  <dd>{p.venue_kind.replaceAll('_', ' ')}</dd>
                </>
              )}
              {p.walk_min != null && (
                <>
                  <dt>Mapped walk</dt>
                  <dd>
                    {p.walk_min} minutes from {origin}; not a verified reset recommendation
                  </dd>
                </>
              )}
              <dt>Access</dt>
              <dd>{p.access_note ?? 'Unconfirmed'}</dd>
              <dt>Hours</dt>
              <dd>
                Unconfirmed —{' '}
                <a
                  href={
                    p.venue_kind && p.source_url ? p.source_url : 'https://libraries.usc.edu/hours'
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  {p.venue_kind ? 'check venue hours' : 'check current library hours'}
                </a>
              </dd>
              <dt>Reservation</dt>
              <dd>
                {p.reservation_required
                  ? 'Required; availability not checked'
                  : 'Unconfirmed; not a guarantee of walk-in access'}
              </dd>
              <dt>Unconfirmed</dt>
              <dd>
                Noise, occupancy, seating condition, lighting, step-free access, after-dark safety,
                current opening and entry.
              </dd>
            </dl>
            <details>
              <summary>Sources &amp; routing limits</summary>
              <p>{p.routing_anchor}</p>
              <a href={p.anchor_source} target="_blank" rel="noreferrer">
                Coordinate source
              </a>
              {p.provenance?.map((source, i) => (
                <p key={i}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.source_type}
                  </a>{' '}
                  · Checked {source.checked}
                  <br />
                  Supports: {source.supports.join(', ')}
                </p>
              ))}
              {Object.entries(p.evidence ?? {}).map(([field, evidence]) => (
                <p key={field}>
                  <a href={evidence.url} target="_blank" rel="noreferrer">
                    {field.replaceAll('_', ' ')} evidence
                  </a>{' '}
                  · Checked {evidence.checked}
                </p>
              ))}
              <p>Historical descriptions may no longer reflect current furniture or use.</p>
            </details>
            <button
              onClick={() =>
                onWalk({ lat: p.lat, lon: p.lng, name: p.name + ' (approximate anchor)' })
              }
            >
              Explore walking route
            </button>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <div className="smart-filter-empty">
          <p>
            No confirmed matches. Unknown attributes are excluded, not treated as absent or present.
          </p>
          <button
            onClick={() => {
              setFilters({ ...DEFAULT_FILTERS })
              setKind('all')
              setQuery('')
            }}
          >
            Clear directory filters
          </button>
        </div>
      )}
    </main>
  )
}
