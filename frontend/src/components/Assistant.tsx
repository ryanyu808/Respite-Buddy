import { useState } from 'react'
import { ArrowUpRight, Sparkles, X, Check, LoaderCircle } from 'lucide-react'
import type { Interpretation, Preferences } from '../types'
import { api } from '../services/api'

export function Assistant({
  current,
  onApply,
}: {
  current: Preferences
  onApply: (p: Preferences) => void
}) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<Interpretation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function interpret() {
    if (!text.trim()) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      setResult(await api<Interpretation>('/ai/preferences', { text, current }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="assistant" aria-label="Describe your ideal walk">
      <div className="section-heading">
        <h2>
          <Sparkles size={16} />
          In your own words
        </h2>
        <span className="beta-label">ASSISTANT</span>
      </div>
      <p>Tell us what would make your walk better.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void interpret()
        }}
      >
        <label className="sr-only" htmlFor="preference-prompt">
          Describe your walking preferences
        </label>
        <textarea
          id="preference-prompt"
          rows={2}
          maxLength={1000}
          placeholder="I'd like a quiet walk near green spaces…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          className="assistant-submit"
          type="submit"
          disabled={busy || !text.trim()}
          aria-label="Interpret preferences"
        >
          {busy ? <LoaderCircle className="spin" size={17} /> : <ArrowUpRight size={19} />}
        </button>
      </form>
      <button
        className="suggestion"
        onClick={() => setText("I don't mind a few extra minutes. I'd like less traffic noise.")}
      >
        “Less traffic noise, please” <ArrowUpRight size={12} />
      </button>
      {error && (
        <p role="alert" className="error-inline">
          {error}
        </p>
      )}
      {result && (
        <div className="interpretation" aria-live="polite">
          <div className="section-heading">
            <strong>Review your settings</strong>
            <span className="mode-label">{result.mode}</span>
          </div>
          <dl>
            {(['noise', 'traffic', 'green', 'crowds'] as const).map((key) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{result.preferences[key]}</dd>
              </div>
            ))}
            <div>
              <dt>Walking priority</dt>
              <dd>{result.preferences.pace}</dd>
            </div>
            <div>
              <dt>Max. detour</dt>
              <dd>
                {result.preferences.max_detour === null
                  ? 'No limit'
                  : `${result.preferences.max_detour}%`}
              </dd>
            </div>
          </dl>
          <p>{result.notes.join(' ')}</p>
          <div className="interpretation-actions">
            <button className="secondary-button" onClick={() => setResult(null)}>
              <X size={14} />
              Cancel
            </button>
            <button
              className="primary-button small"
              onClick={() => {
                onApply(result.preferences)
                setResult(null)
              }}
            >
              <Check size={14} />
              Apply & recalculate
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
