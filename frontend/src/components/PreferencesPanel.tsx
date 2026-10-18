import { AudioLines, CarFront, Trees, RotateCcw } from 'lucide-react'
import { DEFAULTS, PRESETS } from '../preferences'
import type { Preferences } from '../types'

const controls = [
  {
    key: 'noise',
    label: 'Noise sensitivity',
    description: 'Prefer paths farther from major roads.',
    icon: AudioLines,
  },
  {
    key: 'traffic',
    label: 'Traffic avoidance',
    description: 'Spend less of your walk near busy roads.',
    icon: CarFront,
  },
  {
    key: 'green',
    label: 'Green-space preference',
    description: 'Prefer proximity to mapped parks and greenery.',
    icon: Trees,
  },
] as const

export function PreferencesPanel({
  value,
  onChange,
  showPresets = true,
}: {
  value: Preferences
  onChange: (p: Preferences) => void
  showPresets?: boolean
}) {
  return (
    <section className="preferences" aria-labelledby="preferences-title">
      <div className="section-heading">
        <h2 id="preferences-title">Make it your kind of walk</h2>
        <button
          className="icon-button"
          title="Reset preferences"
          aria-label="Reset preferences"
          onClick={() => onChange({ ...DEFAULTS })}
        >
          <RotateCcw size={15} />
        </button>
      </div>
      <p className="section-description">A little quieter. A little greener. Up to you.</p>
      {showPresets && (
        <div className="preset-list">
          {Object.entries(PRESETS).map(([name, settings]) => (
            <button
              key={name}
              className={
                JSON.stringify(value) === JSON.stringify(settings) ? 'chip active' : 'chip'
              }
              onClick={() => onChange({ ...settings })}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      {controls.map(({ key, label, description, icon: Icon }) => (
        <div className="slider-control" key={key}>
          <div className="slider-heading">
            <label htmlFor={`preference-${key}`}>
              <Icon size={17} />
              {label}
            </label>
            <output htmlFor={`preference-${key}`}>
              {value[key]}
              <span>/100</span>
            </output>
          </div>
          <p id={`description-${key}`}>{description}</p>
          <input
            id={`preference-${key}`}
            type="range"
            min="0"
            max="100"
            step="1"
            value={value[key]}
            aria-describedby={`description-${key}`}
            onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })}
            style={{ '--range-progress': `${value[key]}%` } as React.CSSProperties}
          />
        </div>
      ))}
      <fieldset className="pace-control">
        <legend>What matters most today?</legend>
        <div className="segmented">
          {(['fastest', 'balanced', 'calmest'] as const).map((pace) => (
            <button
              key={pace}
              type="button"
              aria-pressed={value.pace === pace}
              onClick={() => onChange({ ...value, pace })}
            >
              {pace === 'fastest' ? 'Less time' : pace === 'calmest' ? 'More calm' : 'A balance'}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="detour-label" htmlFor="detour">
        Extra walking distance
        <select
          id="detour"
          value={value.max_detour ?? 'none'}
          onChange={(e) =>
            onChange({
              ...value,
              max_detour:
                e.target.value === 'none' ? null : (Number(e.target.value) as 10 | 20 | 30),
            })
          }
        >
          <option value="10">Up to 10% more</option>
          <option value="20">Up to 20% more</option>
          <option value="30">Up to 30% more</option>
          <option value="none">No explicit limit</option>
        </select>
      </label>
    </section>
  )
}
