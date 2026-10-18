import { useState } from 'react'
import records from '../data/campus-candidates.json'
import type { Point } from '../types'
export function CampusDirectory({
  onWalk,
  onDemo,
}: {
  onWalk: (point: Point) => void
  onDemo: () => void
}) {
  const [query, setQuery] = useState(''),
    [kind, setKind] = useState('all')
  const filtered = records.filter(
    (p) =>
      `${p.name} ${p.building} ${p.building_code}`.toLowerCase().includes(query.toLowerCase()) &&
      (kind === 'all' || p.indoor === (kind === 'indoor')),
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
              {p.provenance[0].source_type === 'OpenStreetMap snapshot'
                ? 'Mapped potential location'
                : 'USC documented — conditions unconfirmed'}
            </span>
            <h2>{p.name}</h2>
            <p>
              {p.building ?? 'Outdoor mapped space'}
              {p.floor ? ` · Floor ${p.floor}` : ''} · {p.indoor ? 'Indoor' : 'Outdoor'}
            </p>
            <dl>
              <dt>Documented amenities</dt>
              <dd>{p.amenities.join(' · ') || 'No amenity claims confirmed'}</dd>
              <dt>Access</dt>
              <dd>{p.access_note ?? 'Unconfirmed'}</dd>
              <dt>Hours</dt>
              <dd>
                Unconfirmed —{' '}
                <a href="https://libraries.usc.edu/hours" target="_blank" rel="noreferrer">
                  check current library hours
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
              {p.provenance.map((source, i) => (
                <p key={i}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.source_type}
                  </a>{' '}
                  · Checked {source.checked}
                  <br />
                  Supports: {source.supports.join(', ')}
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
      {!filtered.length && <p>No matching spaces. Try a building name or another setting.</p>}
    </main>
  )
}
