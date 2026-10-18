import { DEFAULT_FILTERS, FILTER_LABELS, type FilterKey, type SmartFilters } from '../smartFilters'
export function SmartFilterControls({
  value,
  onChange,
}: {
  value: SmartFilters
  onChange: (next: SmartFilters) => void
}) {
  function toggle(key: FilterKey) {
    onChange({
      ...value,
      [key]: !value[key],
      ...(key === 'indoor' ? { outdoor: false } : key === 'outdoor' ? { indoor: false } : {}),
    })
  }
  const chip = (key: FilterKey) => (
    <button type="button" key={key} aria-pressed={value[key]} onClick={() => toggle(key)}>
      {FILTER_LABELS[key]}
    </button>
  )
  return (
    <div className="smart-filter-controls">
      <p className="reset-small">Optional. Unknown attributes never count as confirmed matches.</p>
      <div className="reset-chips" role="group" aria-label="Quick filters">
        {(['outlets', 'quiet', 'comfortable_seating', 'food_available'] as FilterKey[]).map(chip)}
      </div>
      <details>
        <summary>More filters</summary>
        <div className="reset-chips" role="group" aria-label="More filters">
          {(Object.keys(FILTER_LABELS) as FilterKey[])
            .filter(
              (k) => !['outlets', 'quiet', 'comfortable_seating', 'food_available'].includes(k),
            )
            .map(chip)}
        </div>
        <label className="reset-field">
          Walking limit
          <select
            value={value.max_walk_min ?? ''}
            onChange={(e) =>
              onChange({ ...value, max_walk_min: e.target.value ? Number(e.target.value) : null })
            }
          >
            <option value="">No extra limit</option>
            {[5, 10, 15, 20, 30].map((n) => (
              <option key={n} value={n}>
                {n} minutes walking
              </option>
            ))}
          </select>
        </label>
        <label className="reset-field">
          Access filter
          <select
            value={value.access}
            onChange={(e) =>
              onChange({ ...value, access: e.target.value as SmartFilters['access'] })
            }
          >
            <option value="any">Any documented access</option>
            <option value="open">Confirmed open access</option>
            <option value="usc_id">Confirmed USC ID requirement</option>
          </select>
        </label>
        <label className="reset-field">
          Optional activity
          <select
            value={value.activity}
            onChange={(e) =>
              onChange({ ...value, activity: e.target.value as SmartFilters['activity'] })
            }
          >
            <option value="break">Take a break</option>
            <option value="study">Study</option>
            <option value="charge">Charge devices</option>
            <option value="eat">Eat lunch</option>
            <option value="between">Between classes</option>
            <option value="friend">Meet a friend</option>
          </select>
        </label>
      </details>
      <button className="reset-link" onClick={() => onChange({ ...DEFAULT_FILTERS })}>
        Clear filters
      </button>
    </div>
  )
}
