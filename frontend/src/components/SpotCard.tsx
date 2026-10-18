import { ArrowRight, Check, Footprints, RotateCcw } from 'lucide-react'
import { crowdLabel, timeLabel, type Recommendation } from '../respite'
import { LocationPhoto, PhotoCredit } from './LocationPhoto'

export function SpotCard({
  item,
  rank,
  selected,
  evaluatedAt,
  demo,
  backupName,
  busy,
  onSelect,
  onSwap,
}: {
  item: Recommendation
  rank: number
  selected: boolean
  evaluatedAt: string
  demo: boolean
  backupName?: string
  busy: boolean
  onSelect: () => void
  onSwap: (reason: 'full' | 'locked' | 'another') => void
}) {
  const { spot } = item
  const verified = spot.data_kind === 'scouted' && !!spot.verified_by && !!spot.verified_date
  return (
    <article
      className={`reset-spot-card ${selected ? 'selected' : ''}`}
      aria-label={`${rank}. ${spot.name}`}
    >
      <LocationPhoto place={spot} />
      <div className="reset-card-heading">
        <span className="reset-rank">{String(rank).padStart(2, '0')}</span>
        <div>
          <h3>{spot.name}</h3>
          <p>
            {[spot.building, spot.building_code, spot.floor != null ? `Floor ${spot.floor}` : null]
              .filter(Boolean)
              .join(' · ') || 'Campus location'}
          </p>
        </div>
        <span className="reset-source">
          {demo || spot.data_kind === 'illustrative'
            ? 'Illustrative demo'
            : verified
              ? 'Verified by scouts'
              : 'Check access'}
        </span>
      </div>
      <div className="reset-card-times">
        <div>
          <strong>
            {Math.floor(item.rest_min)}
            <small> min</small>
          </strong>
          <span>
            to rest
            {item.walk_to_class_min === null || spot.data_kind === 'mapped' ? ' · provisional' : ''}
          </span>
        </div>
        {item.walk_to_class_min !== null && (
          <div>
            <strong>{timeLabel(item.leave_by)}</strong>
            <span>leave by · Pacific</span>
          </div>
        )}
      </div>
      {item.tight_on_time && <p className="reset-tight">Tight on time.</p>}
      <p className="reset-walk-time">
        <Footprints size={15} aria-hidden="true" />
        {Math.ceil(item.walk_to_min)} min to spot
        {item.walk_to_class_min !== null
          ? ` · ${Math.ceil(item.walk_to_class_min)} min to class`
          : ' · next-class walk not included'}
      </p>
      <details className="reset-spot-details location-more">
        <summary>More info</summary>
        <ul className="reset-why">
          {item.why.map((value) => (
            <li key={value}>
              <Check size={13} aria-hidden="true" />
              {value}
            </li>
          ))}
        </ul>
        <p className="reset-crowd">{crowdLabel(item.crowd, evaluatedAt)}</p>
        <p>
          Food for purchase:{' '}
          {spot.food_available == null
            ? 'unknown'
            : spot.food_available
              ? 'documented'
              : 'confirmed absent'}
          . Food allowed:{' '}
          {spot.food_allowed == null
            ? 'unknown'
            : spot.food_allowed
              ? 'documented'
              : 'confirmed absent'}
          .
        </p>
        <p>
          {spot.access
            ? { open: 'Open access', usc_id: 'USC ID required', restricted: 'Restricted access' }[
                spot.access
              ]
            : 'Access unconfirmed.'}
          {spot.access_note ? ` · ${spot.access_note}` : ''}
        </p>
        <p>
          {spot.hours
            ? `Listed hours: ${Object.entries(spot.hours)
                .map(
                  ([day, intervals]) =>
                    `${day}: ${intervals.map((value) => `${value.start}–${value.end}`).join(', ') || 'closed'}`,
                )
                .join('; ')}`
            : 'Opening hours unknown.'}
        </p>
        <p>
          Step-free access:{' '}
          {spot.step_free == null
            ? 'unconfirmed'
            : spot.step_free
              ? 'listed'
              : 'not listed as step-free'}
          . After-dark safety: {spot.safe_after_dark === true ? 'listed' : 'unconfirmed'}.
        </p>
        <p>
          {spot.indoor == null ? 'Indoor/outdoor unknown' : spot.indoor ? 'Indoor' : 'Outdoor'} ·
          seating: {spot.seating ?? 'unknown'} · lighting: {spot.lighting ?? 'unknown'} · outlets:{' '}
          {spot.outlets == null ? 'unknown' : spot.outlets ? 'listed' : 'not listed'}.
        </p>
        {verified && (
          <p>
            Scout verification: {spot.verified_by} · {spot.verified_date}
          </p>
        )}
        {spot.notes && <p>{spot.notes}</p>}
        {spot.source_url && /^https?:\/\//.test(spot.source_url) && (
          <a href={spot.source_url} target="_blank" rel="noreferrer">
            View mapped source
          </a>
        )}
        <PhotoCredit place={spot} />
      </details>
      <div className="reset-card-actions">
        <button
          className="reset-walk-button"
          aria-pressed={selected}
          disabled={busy}
          onClick={onSelect}
        >
          Walk me there <ArrowRight size={15} aria-hidden="true" />
        </button>
        <button disabled={busy} onClick={() => onSwap('full')}>
          It’s full
        </button>
        <details className="reset-card-more">
          <summary>Other options</summary>
          <button disabled={busy} onClick={() => onSwap('locked')}>
            It’s locked
          </button>
          <button
            disabled={busy}
            onClick={() => onSwap('another')}
            aria-label={`Find another spot instead of ${spot.name}`}
          >
            <RotateCcw size={15} aria-hidden="true" />
          </button>
        </details>
      </div>
    </article>
  )
}
