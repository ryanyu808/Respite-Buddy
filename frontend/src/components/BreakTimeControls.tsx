import { useState } from 'react'
import { breakWindow, timeFields } from '../breakTime'

export function BreakTimeControls({
  minutes,
  clock,
  onWindow,
  submitLabel = 'Calculate my break',
}: {
  minutes: number
  clock: string
  onWindow: (window: { minutes: number; now: string; deadline: string }) => void
  submitLabel?: string
}) {
  const [fields, setFields] = useState(() => timeFields(clock, minutes))
  const [error, setError] = useState('')
  return (
    <div className="break-time-controls">
      <form
        aria-label="Your break times"
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
              error instanceof Error && /Choose|End time/.test(error.message)
                ? error.message
                : 'These times are invalid or ambiguous. Check the date and Pacific times.',
            )
          }
        }}
      >
        <div className="form-grid">
          <label className="reset-field">
            Start time
            <input
              type="time"
              required
              value={fields.current}
              onChange={(e) => setFields({ ...fields, current: e.target.value })}
            />
          </label>
          <label className="reset-field">
            End time
            <input
              type="time"
              required
              value={fields.classStarts}
              onChange={(e) => setFields({ ...fields, classStarts: e.target.value })}
            />
          </label>
        </div>
        <details className="break-date-options">
          <summary>Date &amp; overnight</summary>
          <label className="reset-field">
            Break date
            <input
              type="date"
              required
              value={fields.date}
              onChange={(e) => setFields({ ...fields, date: e.target.value })}
            />
          </label>
          <label className="reset-check">
            <input
              type="checkbox"
              checked={fields.nextDay}
              onChange={(e) => setFields({ ...fields, nextDay: e.target.checked })}
            />{' '}
            End time is the next day
          </label>
        </details>
        <p className="reset-small">Pacific time · {minutes} minutes available</p>
        {error && (
          <p role="alert" className="reset-time-error">
            {error}
          </p>
        )}
        <button
          className={submitLabel === 'Find me a spot' ? 'primary-button demo-find' : 'reset-link'}
          type="submit"
        >
          {submitLabel}
        </button>
      </form>
    </div>
  )
}
