import { useEffect, useRef } from 'react'
import { X, ExternalLink } from 'lucide-react'
import type { Metadata } from '../types'

export function InfoDialog({
  page,
  metadata,
  onClose,
}: {
  page: 'about' | 'methodology'
  metadata: Metadata | null
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
    return () => ref.current?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="info-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="dialog-heading">
        <span className="eyebrow">NEUROROUTE</span>
        <button className="icon-button" onClick={onClose} aria-label="Close information">
          <X size={21} />
        </button>
      </div>
      {page === 'about' ? (
        <>
          <h2>Find your calmer way.</h2>
          <p>
            Walking directions should reflect the person taking the walk. NeuroRoute helps you
            compare paths around USC according to your own sensory preferences.
          </p>
          <h3>Your walk, your preferences</h3>
          <p>
            Designed for people who prefer quieter, greener environments, including neurodivergent
            students and people with sensory sensitivities. Everyone's preferences are different.
            This is an accessibility tool, not a medical device.
          </p>
          <h3>How it works</h3>
          <p>
            We route along a real OpenStreetMap walking network, estimate environmental exposure
            from geography, and compare the extra distance with your preferences. The optional AI
            assistant translates your words into settings and selects explanation emphasis. NetworkX
            performs the routing.
          </p>
          <h3>Privacy by default</h3>
          <p>
            No accounts or diagnoses. Preferences are stored in this browser only. Map selections
            are processed by your local backend. When an OpenAI key is configured, assistant text,
            current preferences, or route summaries may be sent to OpenAI. No key is sent to the
            browser. Map tiles are requested from OpenStreetMap servers.
          </p>
        </>
      ) : (
        <>
          <h2>Real paths. Transparent estimates.</h2>
          <p>
            The map is real geographic data. Sensory exposure is an estimate based on that
            geography, with no real-time sensors.
          </p>
          <h3>What's behind a score?</h3>
          <p>
            Each path segment gets traffic and noise proxy values from road classification and
            proximity to major roads (within 100 m). Green-space proximity uses distance to mapped
            parks, gardens and grass (within 80 m).
          </p>
          <p>
            The 0–100 score is a distance-weighted average of available proxies, weighted by your
            sliders. Green preference penalizes distance from green spaces. Lower means less modeled
            exposure under the selected preferences; it is not a measurement of stress or a clinical
            rating. Changing preferences changes the score definition.
          </p>
          <h3>What's missing?</h3>
          <p>
            Crowds, live sound, lighting and construction conditions are unavailable. The crowd
            slider is saved but excluded from costs and scores. Noise and traffic proxies overlap
            and are not independent evidence. Green-space proximity does not prove shade or
            quietness.
          </p>
          <h3>Routes & time</h3>
          <p>
            Positive distance-plus-exposure costs generate a bounded set of candidate paths. Results
            respect your maximum extra distance. The search is heuristic and does not prove the
            globally optimal constrained route. Near-identical routes are combined. Walking time
            assumes 4.8 km/h by default and excludes entrance offsets and crossing delays.
          </p>
          <h3>Snapshot</h3>
          <p>
            {metadata?.source ?? 'OpenStreetMap'} ·{' '}
            {metadata?.retrieved_at
              ? new Date(metadata.retrieved_at).toLocaleDateString()
              : 'Not loaded'}
            . {metadata?.nodes?.toLocaleString()} nodes; {metadata?.edges?.toLocaleString()}{' '}
            directed edges. USC University Park and nearby areas only.
          </p>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap contributors · ODbL <ExternalLink size={13} />
          </a>
        </>
      )}
      <p className="disclaimer">
        NeuroRoute estimates potential sensory exposure using available geographic data. Actual
        conditions may differ. Follow posted signs and use your judgment when navigating.
      </p>
      <button className="primary-button" onClick={onClose}>
        Back to my walk
      </button>
    </dialog>
  )
}
