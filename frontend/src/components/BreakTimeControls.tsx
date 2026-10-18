import { useState } from 'react'
import { BREAK_INTERVALS, breakLabel, breakWindow, timeFields } from '../breakTime'

export function BreakTimeControls({
  minutes,
  clock,
  onPreset,
  onWindow,
}: {
  minutes: number
  clock: string
  onPreset: (minutes: number) => void
  onWindow: (window: { minutes: number; now: string; deadline: string }) => void
}) {
  const [fields, setFields] = useState(() => timeFields(clock))
  const [error, setError] = useState('')
  return (
    <div className="break-time-controls">
      <p className="reset-label">Available time</p>
      <div className="reset-chips" role="group" aria-label="Available time">
        {BREAK_INTERVALS.map((value) => (
          <button
            key={value}
            aria-pressed={minutes === value}
            onClick={() => {
              setError('')
              onPreset(value)
            }}
          >
            {breakLabel(value)}
          </button>
        ))}
      </div>
      {!BREAK_INTERVALS.some((value) => value === minutes) && (
        <p className="reset-small">Calculated break: {minutes} minutes.</p>
      )}
      <details className="break-exact-time">
        <summary>Or use current time &amp; class start</summary>
        <p className="reset-small">Campus time · Pacific. Times are used for this search only.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            try {
              const window = breakWindow(
                fields.date,
                fields.current,
                fields.classStarts,
                fields.nextDay,
              )
              setError('')
              onWindow(window)
            } catch (error) {
              setError(
                error instanceof Error && /Choose|Class must/.test(error.message)
                  ? error.message
                  : 'These times are invalid or ambiguous. Check the date and Pacific times.',
              )
            }
          }}
        >
          <label className="reset-field">
            Break date
            <input
              type="date"
              required
              value={fields.date}
              onChange={(e) => setFields({ ...fields, date: e.target.value })}
            />
          </label>
          <div className="form-grid">
            <label className="reset-field">
              Current time
              <input
                type="time"
                required
                value={fields.current}
                onChange={(e) => setFields({ ...fields, current: e.target.value })}
              />
            </label>
            <label className="reset-field">
              Class starts
              <input
                type="time"
                required
                value={fields.classStarts}
                onChange={(e) => setFields({ ...fields, classStarts: e.target.value })}
              />
            </label>
          </div>
          <label className="reset-check">
            <input
              type="checkbox"
              checked={fields.nextDay}
              onChange={(e) => setFields({ ...fields, nextDay: e.target.checked })}
            />{' '}
            Class starts the next day
          </label>
          {error && (
            <p role="alert" className="reset-time-error">
              {error}
            </p>
          )}
          <button className="reset-link" type="submit">
            Calculate my break
          </button>
        </form>
      </details>
    </div>
  )
}
