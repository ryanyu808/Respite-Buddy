import { useMemo, useState } from 'react'
import { Check, CircleAlert, MapPin, RotateCcw, Sparkles } from 'lucide-react'
import type { RestStop } from '../types'

type Need = 'quiet' | 'sit' | 'green'

const needs: { id: Need; label: string; description: string }[] = [
  { id: 'quiet', label: 'A lower-stimulation option', description: 'Use mapped green-space or bench data only.' },
  { id: 'sit', label: 'Somewhere to pause', description: 'Show mapped benches and potential rest stops.' },
  { id: 'green', label: 'A nearby green space', description: 'Show mapped parks and green areas.' },
]

export function RespiteBuddy({ stops, onClose }: { stops: RestStop[]; onClose: () => void }) {
  const [need, setNeed] = useState<Need>('quiet')
  const [reset, setReset] = useState(false)
  const matches = useMemo(() => {
    const ranked = [...stops].sort((a, b) => {
      const aScore = need === 'sit' && a.kind === 'bench' ? 0 : need === 'green' && a.kind === 'park' ? 0 : 1
      const bScore = need === 'sit' && b.kind === 'bench' ? 0 : need === 'green' && b.kind === 'park' ? 0 : 1
      return aScore - bScore || a.name.localeCompare(b.name)
    })
    return ranked.slice(0, 5)
  }, [need, stops])

  return (
    <section className="respite-panel" aria-labelledby="respite-title">
      <div className="respite-heading">
        <div><div className="eyebrow"><Sparkles size={13} /> RESPITE BUDDY</div><h2 id="respite-title">Reset before class</h2></div>
        <button className="icon-button" aria-label="Close Respite Buddy" onClick={onClose}>×</button>
      </div>
      <p className="respite-lead">A small pause can help you arrive with more capacity. What would help right now?</p>
      <div className="respite-needs" role="group" aria-label="What would help">
        {needs.map((item) => <button key={item.id} className={need === item.id ? 'respite-need active' : 'respite-need'} onClick={() => { setNeed(item.id); setReset(false) }} aria-pressed={need === item.id}>{item.label}</button>)}
      </div>
      <div className="reset-card">
        <div className="reset-card-icon"><RotateCcw size={18} /></div>
        <div><strong>Try a 60-second reset</strong><p>Pause, drop your shoulders, and notice one thing you can hear and one thing you can feel.</p></div>
        <button className="primary-button" onClick={() => setReset(true)}>{reset ? <><Check size={15} /> Done</> : 'Start'}</button>
      </div>
      <h3>Mapped possibilities near campus</h3>
      <p className="respite-note"><CircleAlert size={14} /> These are mapped potential rest stops, not verified quiet or accessible spaces.</p>
      <div className="respite-list">
        {matches.map((stop) => <a className="respite-spot" key={stop.id} href={stop.osm_url} target="_blank" rel="noreferrer"><MapPin size={16} /><span><strong>{stop.name}</strong><small>{stop.kind} · opening hours unknown</small></span></a>)}
        {!matches.length && <p>No mapped possibilities are available in this demo.</p>}
      </div>
      <button className="text-button" onClick={onClose}>Back to route planning</button>
    </section>
  )
}
