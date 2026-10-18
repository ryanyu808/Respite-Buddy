import { useEffect, useRef, useState } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import {
  DAYS,
  ZONE,
  today,
  inZone,
  weekDays,
  manualEvent,
  occurrences,
  overlaps,
  mergeEvents,
  sampleSchedule,
  type CalendarEvent,
  type ManualDraft,
} from '../calendar/model'
import { readSchedule, saveSchedule, clearSchedule } from '../calendar/storage'
import { parseICS, type ImportPreview } from '../calendar/ics'
import { recognizeScreenshot, parseScheduleText } from '../calendar/screenshot'
import {
  connectMicrosoft,
  microsoftConfigured,
  microsoftCalendars,
  importMicrosoft,
  disconnectMicrosoft,
} from '../calendar/providers'
import { FALLBACK } from '../data/fallback'
import {
  googleConfigured,
  connectGoogle,
  disconnectGoogle,
  revokeGoogle,
  importGoogle,
} from '../calendar/google'
import { api } from '../services/api'
import { savedDemo } from '../services/respiteApi'
import { loadFilters } from '../smartFilters'
import type { Location } from '../types'
import { NEEDS, type Need, type ResetRequest, type Recommendation } from '../respite'

type Gap = {
  start: string
  end: string
  recommendation: Recommendation | null
  recommendations?: Recommendation[]
  notes: string[]
  reset_request: ResetRequest
}
const clock = (value: string) => inZone(value).toPlainTime().toString().slice(0, 5)
const empty = (): ManualDraft => ({
  title: '',
  section: '',
  date: today(),
  until: '',
  start: '09:00',
  end: '10:00',
  days: [],
  location: '',
  buildingCode: '',
  room: '',
  notes: '',
  category: 'class',
})
export function MySchedule({
  onReset,
  onDirectory,
  initialSample = null,
  onSampleChange,
  initialDate,
  onDateChange,
}: {
  onReset: (request: ResetRequest) => void
  onDirectory: () => void
  initialSample?: CalendarEvent[] | null
  onSampleChange?: (value: CalendarEvent[] | null) => void
  initialDate?: string
  onDateChange?: (value: string) => void
}) {
  const [events, setEvents] = useState<CalendarEvent[]>([]),
    [sample, setSample] = useState<CalendarEvent[] | null>(initialSample)
  const [ready, setReady] = useState(false),
    [date, setDate] = useState(initialDate ?? today()),
    [draft, setDraft] = useState<ManualDraft>(empty)
  const [editing, setEditing] = useState<string | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null),
    [replace, setReplace] = useState(false)
  const [from, setFrom] = useState(today),
    [through, setThrough] = useState(() =>
      Temporal.PlainDate.from(today()).add({ days: 90 }).toString(),
    )
  const [busy, setBusy] = useState(false),
    [ocr, setOcr] = useState(''),
    [progress, setProgress] = useState(0)
  const [needs, setNeeds] = useState<Need[]>([]),
    [uscId, setUscId] = useState(false),
    [gaps, setGaps] = useState<Gap[] | null>(null)
  const [buildings, setBuildings] = useState<Location[]>(FALLBACK.buildings ?? FALLBACK.locations)
  const [calendars, setCalendars] = useState<{ id: string; name: string }[]>([]),
    [calendar, setCalendar] = useState('')
  const [googleConnected, setGoogleConnected] = useState(false)
  const alive = useRef(true),
    requestId = useRef(0)
  useEffect(() => {
    onSampleChange?.(sample)
  }, [sample])
  useEffect(() => {
    onDateChange?.(date)
  }, [date])
  useEffect(() => {
    alive.current = true
    readSchedule()
      .then((value) => {
        if (alive.current) setEvents(value)
      })
      .catch((e) => {
        if (alive.current) setError(e.message)
      })
      .finally(() => {
        if (alive.current) setReady(true)
      })
    api<Location[]>('/buildings')
      .then((v) => {
        if (alive.current) setBuildings(v)
      })
      .catch(() => {})
    return () => {
      alive.current = false
      disconnectMicrosoft()
      disconnectGoogle()
    }
  }, [])
  const days = weekDays(date),
    visible = occurrences(sample ?? events, days[0], days[6])
  const selected = visible.filter((e) => inZone(e.start).toPlainDate().toString() === date)
  const classes = selected.filter((e) => e.category === 'class' && !e.allDay)
  const next = visible.find((e) => e.category === 'class' && Date.parse(e.start) > Date.now())
  useEffect(() => {
    requestId.current++
    setGaps(null)
  }, [date, events, sample, needs, uscId])
  async function persist(value: CalendarEvent[]) {
    if (sample) {
      setSample(value)
      return
    }
    setEvents(value)
    try {
      await saveSchedule(value)
    } catch (e) {
      setError((e as Error).message + ' Changes remain in this tab only.')
    }
  }
  async function run(work: () => Promise<void>) {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await work()
    } catch (e) {
      if (alive.current) setError((e as Error).message)
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  function edit(event: CalendarEvent) {
    const master =
      (sample ?? events).find((e) => event.id === e.id || event.id.startsWith(e.id + '@')) ?? event
    const start = inZone(master.start),
      end = inZone(master.end)
    setEditing(master.id)
    setDraft({
      title: master.title,
      section: master.section,
      date: start.toPlainDate().toString(),
      until: master.recurrence?.until ?? '',
      start: start.toPlainTime().toString().slice(0, 5),
      end: end.toPlainTime().toString().slice(0, 5),
      days: master.recurrence?.days ?? [],
      location: master.location,
      buildingCode: master.buildingCode,
      room: master.room,
      notes: master.notes,
      category: master.category,
    })
    document.getElementById('course-name')?.focus()
  }
  function add() {
    void run(async () => {
      const current = sample ?? events,
        existing = current.find((e) => e.id === editing),
        event = manualEvent(draft, existing)
      const base = current.filter((e) => e.id !== editing),
        merged = mergeEvents(base, [event])
      if (merged.length === base.length)
        throw new Error('That event already exists. Nothing was added.')
      await persist(merged)
      setEditing(null)
      setDraft(empty())
      setNotice('Saved locally. Review overlap warnings before planning gaps.')
    })
  }
  async function plan() {
    const sequence = ++requestId.current
    await run(async () => {
      if (classes.length < 2)
        throw new Error('Add at least two events marked Class on this day to find a gap.')
      if (overlaps(classes))
        throw new Error('Classes overlap. Correct their times before planning.')
      if (classes.some((e) => !e.location.trim() && !e.buildingCode.trim()))
        throw new Error('Correct missing class buildings before planning.')
      // No titles, notes, room numbers, IDs or full calendar leave the browser.
      const payload = {
        filters: loadFilters(),
        classes: classes.map((e) => ({
          start: e.start,
          end: e.end,
          location: e.buildingCode || e.location,
        })),
        needs,
        demo: Boolean(sample),
        usc_id: uscId,
      }
      let result: { gaps: Gap[] }
      if (sample) {
        const output: Gap[] = []
        for (let i = 0; i < classes.length - 1; i++) {
          const previous = classes[i],
            following = classes[i + 1],
            minutes = Math.min(
              240,
              Math.floor((Date.parse(following.start) - Date.parse(previous.end)) / 60000),
            )
          if (minutes < 1) continue
          const request: ResetRequest = {
            filters: loadFilters(),
            near: previous.buildingCode || previous.location,
            next_class: following.buildingCode || following.location,
            minutes,
            needs,
            demo: true,
            demo_time: previous.end,
            deadline: following.start,
            usc_id: uscId,
          }
          const saved = savedDemo(request)
          if (!saved) {
            result = await api('/plan-day', payload)
            if (sequence === requestId.current && alive.current) setGaps(result.gaps)
            return
          }
          output.push({
            start: previous.end,
            end: following.start,
            recommendation: saved.response.recommendations[0] ?? null,
            recommendations: saved.response.recommendations,
            notes: saved.response.notes,
            reset_request: request,
          })
        }
        result = { gaps: output }
      } else result = await api('/plan-day', payload)
      if (sequence === requestId.current && alive.current) setGaps(result.gaps)
    })
  }
  const field = (key: keyof ManualDraft, value: string) => setDraft((d) => ({ ...d, [key]: value }))
  const updatePreview = (id: string, patch: Partial<CalendarEvent>) =>
    setPreview((p) =>
      p ? { ...p, events: p.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) } : p,
    )
  return (
    <main className="campus-page schedule-page" id="campus-content" tabIndex={-1}>
      <div className="eyebrow">A LITTLE ROOM IN YOUR WEEK</div>
      <h1>My Schedule</h1>
      <p className="page-intro">
        Your classes stay on this device. No account required. Calendar use is optional; the same
        NeuroRoute engine plans both walking legs and preserves your next-class deadline.
      </p>
      <div className="calendar-notice">
        <strong>
          {sample
            ? 'DEMO ONLY — sample schedule; your actual records are untouched.'
            : 'Local schedule · America/Los_Angeles'}
        </strong>
        <p>
          Imports are reviewed before saving. Only reviewed class locations and times are sent when
          you choose to plan a day. No private titles or schedule contents are put in links.
        </p>
        <div className="action-row">
          <button
            onClick={() => {
              setSample(sampleSchedule())
              setDate('2026-10-19')
              setEditing(null)
              setError('')
              setNotice(
                'Sample schedule loaded separately. Select Monday and find reset opportunities.',
              )
            }}
          >
            Import sample schedule
          </button>
          {sample && (
            <button
              onClick={() => {
                setSample(null)
                setDate(today())
                setEditing(null)
                setDraft(empty())
              }}
            >
              Return to my actual schedule
            </button>
          )}
          <button
            disabled={!ready || busy}
            onClick={() => {
              if (
                window.confirm(
                  sample
                    ? 'Clear the sample schedule? Your actual schedule stays untouched.'
                    : 'Delete all saved schedule events on this device? This cannot be undone.',
                )
              )
                void run(async () => {
                  if (sample) setSample([])
                  else {
                    await clearSchedule()
                    setEvents([])
                  }
                  disconnectMicrosoft()
                  disconnectGoogle()
                  setGoogleConnected(false)
                  setCalendars([])
                  setPreview(null)
                  setOcr('')
                  setEditing(null)
                  setDraft(empty())
                  setNotice('Local schedule and import preview cleared. Provider disconnected.')
                })
            }}
          >
            Clear {sample ? 'sample' : 'all local'} schedule
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="calendar-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <section aria-label="Weekly schedule" className="schedule-section">
        <div className="section-heading">
          <h2>Your week</h2>
          <label>
            Selected date
            <input
              type="date"
              value={date}
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value)
              }}
            />
          </label>
        </div>
        <p>
          {next
            ? `Next class this week: ${next.title} · ${clock(next.start)} · ${next.location}`
            : 'No upcoming class in the displayed week.'}{' '}
          All times shown in Los Angeles.
        </p>
        <div className="week-grid" role="group" aria-label="Choose a day">
          {days.map((day, i) => (
            <button
              key={day}
              className={`week-day ${date === day ? 'selected' : ''}`}
              aria-pressed={date === day}
              onClick={() => setDate(day)}
            >
              <strong>{DAYS[i]}</strong>
              <span>
                {day.slice(5)}
                {day === today() ? ' · Today' : ''}
              </span>
              {visible
                .filter((e) => inZone(e.start).toPlainDate().toString() === day)
                .map((e) => (
                  <span
                    className={`week-block ${e.category === 'class' ? 'is-class' : ''}`}
                    key={e.id}
                  >
                    {e.allDay ? 'All day' : clock(e.start)} · {e.title}
                    <small>{e.buildingCode || e.location || 'Building unconfirmed'}</small>
                  </span>
                ))}
            </button>
          ))}
        </div>
        <h3>{date} · Day detail</h3>
        {!selected.length && <p>No events on this day. Add a class below or import a calendar.</p>}
        {overlaps(selected) && (
          <p className="calendar-error" role="status">
            Events overlap. Correct class conflicts before planning.
          </p>
        )}
        <ol className="day-agenda">
          {selected.map((event) => (
            <li key={event.id}>
              <div>
                <strong>{event.title}</strong>
                <p>
                  {event.allDay ? 'All day' : `${clock(event.start)}–${clock(event.end)}`} ·{' '}
                  {event.location || 'Building unconfirmed'} {event.room} · {event.category} ·{' '}
                  {event.source}
                </p>
              </div>
              <div className="action-row">
                <button onClick={() => edit(event)}>Edit {event.title}</button>
                <button
                  onClick={() =>
                    void persist(
                      (sample ?? events).filter(
                        (e) => event.id !== e.id && !event.id.startsWith(e.id + '@'),
                      ),
                    )
                  }
                >
                  Delete {event.title}
                </button>
              </div>
            </li>
          ))}
        </ol>
        <fieldset>
          <legend>Reset preferences for this day</legend>
          <div className="action-row">
            {NEEDS.map((n) => (
              <label key={n.id}>
                <input
                  type="checkbox"
                  checked={needs.includes(n.id)}
                  onChange={() =>
                    setNeeds((v) => (v.includes(n.id) ? v.filter((x) => x !== n.id) : [...v, n.id]))
                  }
                />
                {n.label}
              </label>
            ))}
            <label>
              <input type="checkbox" checked={uscId} onChange={(e) => setUscId(e.target.checked)} />
              I have an eligible USC ID
            </label>
          </div>
        </fieldset>
        <button
          className="calendar-primary"
          disabled={busy || classes.length < 2}
          onClick={() => void plan()}
        >
          {busy ? 'Working locally / contacting campus service…' : 'Find reset opportunities'}
        </button>
        <p>
          Gap results are schedule-time projections, not live availability. Unknown or disconnected
          buildings require correction. Sample gaps use saved engine results when an exact match is
          available.
        </p>
        {gaps && (
          <div className="gap-list" aria-live="polite">
            {gaps.length === 0 && <p>No positive class gaps on this day.</p>}
            {gaps.map((gap, i) => (
              <article className="calendar-gap" key={i}>
                <h3>
                  {clock(gap.start)}–{clock(gap.end)} ·{' '}
                  {Math.floor((Date.parse(gap.end) - Date.parse(gap.start)) / 60000)} minute gap
                </h3>
                {gap.recommendation ? (
                  <>
                    <p>
                      {sample ? 'Demo only: ' : ''}
                      {gap.recommendation.spot.name} · {gap.recommendation.rest_min} min to rest ·
                      leave by {clock(gap.recommendation.leave_by)}
                    </p>
                    <p>
                      {Math.max(0, (gap.recommendations?.length ?? 1) - 1)} backup options. Both
                      walking legs calculated by NeuroRoute.
                    </p>
                  </>
                ) : (
                  <p>
                    We're still confirming campus spaces. You can explore documented locations or
                    try the sample demo.
                  </p>
                )}
                <div className="action-row">
                  <button
                    onClick={() =>
                      onReset({
                        ...gap.reset_request,
                        ...(sample
                          ? {}
                          : {
                              now: new Date(
                                Math.max(Date.now(), Date.parse(gap.start)),
                              ).toISOString(),
                            }),
                      })
                    }
                  >
                    Open this break &amp; walking directions
                  </button>
                  <button onClick={onDirectory}>Explore documented locations</button>
                </div>
                {gap.notes.map((note, j) => (
                  <p key={j}>{note}</p>
                ))}
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="schedule-section" aria-label="Manual class entry">
        <h2>{editing ? 'Edit event' : 'Add a class or event'}</h2>
        <p>
          Editing a recurring manual entry updates its series; imported occurrences are corrected
          individually. Unknown building names can be saved but will need correction for routing.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <div className="form-grid">
            <label>
              Course or event name
              <input
                id="course-name"
                required
                maxLength={300}
                value={draft.title}
                onChange={(e) => field('title', e.target.value)}
              />
            </label>
            <label>
              Section (optional)
              <input value={draft.section} onChange={(e) => field('section', e.target.value)} />
            </label>
            <label>
              First date
              <input
                required
                type="date"
                value={draft.date}
                onChange={(e) => field('date', e.target.value)}
              />
            </label>
            <label>
              Last recurring date (optional)
              <input
                type="date"
                value={draft.until}
                onChange={(e) => field('until', e.target.value)}
              />
            </label>
            <label>
              Starts
              <input
                required
                type="time"
                value={draft.start}
                onChange={(e) => field('start', e.target.value)}
              />
            </label>
            <label>
              Ends
              <input
                required
                type="time"
                value={draft.end}
                onChange={(e) => field('end', e.target.value)}
              />
            </label>
            <label>
              Building
              <input
                required
                list="schedule-buildings"
                value={draft.location}
                onChange={(e) => field('location', e.target.value)}
              />
            </label>
            <label>
              Building code (optional)
              <input
                list="schedule-buildings"
                value={draft.buildingCode}
                onChange={(e) => field('buildingCode', e.target.value)}
              />
            </label>
            <label>
              Room (optional)
              <input value={draft.room} onChange={(e) => field('room', e.target.value)} />
            </label>
            <label>
              Category
              <select value={draft.category} onChange={(e) => field('category', e.target.value)}>
                <option value="class">Class</option>
                <option value="other">Other event</option>
                <option value="unclassified">Unclassified</option>
              </select>
            </label>
            <label>
              Notes (optional)
              <textarea
                maxLength={2000}
                value={draft.notes}
                onChange={(e) => field('notes', e.target.value)}
              />
            </label>
          </div>
          <datalist id="schedule-buildings">
            {buildings.map((b) => (
              <option key={b.id} value={b.name}>
                {b.aliases?.join(', ')}
              </option>
            ))}
          </datalist>
          <fieldset>
            <legend>Repeat weekly (leave unchecked for a single date)</legend>
            <div className="action-row">
              {DAYS.map((day, i) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={draft.days.includes(i + 1)}
                    onChange={() =>
                      setDraft((d) => ({
                        ...d,
                        days: d.days.includes(i + 1)
                          ? d.days.filter((v) => v !== i + 1)
                          : [...d.days, i + 1],
                      }))
                    }
                  />
                  {day}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="action-row">
            <button className="calendar-primary" disabled={!ready || busy} type="submit">
              {editing ? 'Save event changes' : 'Add event'}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(null)
                  setDraft(empty())
                }}
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </section>
      <section className="schedule-section" aria-label="Schedule import">
        <h2>Bring your schedule</h2>
        <p>
          Google, Outlook and Apple Calendar exports: upload an .ics file. In Apple Calendar on Mac,
          select your calendar, then File → Export → Export. No Apple ID password is requested.
        </p>
        <div className="form-grid">
          <label>
            Import range starts
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            Import range ends (maximum 120 days)
            <input type="date" value={through} onChange={(e) => setThrough(e.target.value)} />
          </label>
          <label>
            ICS calendar file
            <input
              type="file"
              accept=".ics,text/calendar"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file)
                  void run(async () => {
                    if (file.size > 2 * 1024 * 1024)
                      throw new Error('Calendar file must be 2 MB or smaller.')
                    setPreview(parseICS(await file.text(), from, through))
                    setReplace(false)
                  })
              }}
            />
          </label>
        </div>
        <details>
          <summary>Import a schedule screenshot (local OCR)</summary>
          <p>
            PNG, JPEG or WebP, up to 5 MB / 16 megapixels. Recognition runs on your device; no image
            is sent to an AI API. The OCR worker and language model need a network download on first
            use. Grid layouts may need manual correction; extracted text is never treated as
            verified.
          </p>
          <label>
            Schedule screenshot
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file)
                  void run(async () => {
                    setProgress(0)
                    setOcr(await recognizeScreenshot(file, setProgress))
                    setNotice('OCR finished. Correct the text below before creating a preview.')
                  })
              }}
            />
          </label>
          {busy && <p role="status">Recognition progress: {Math.round(progress * 100)}%</p>}
          <label>
            Review OCR text
            <textarea
              rows={6}
              value={ocr}
              onChange={(e) => setOcr(e.target.value)}
              placeholder="Title | Mon,Wed | 09:00-10:15 | LVL | 201"
            />
          </label>
          <button
            disabled={!ocr.trim() || busy}
            onClick={() => {
              setPreview(parseScheduleText(ocr, from))
              setReplace(false)
            }}
          >
            Review extracted rows
          </button>
        </details>
        <details>
          <summary>Connect a read-only calendar (optional)</summary>
          <p>
            Connections require registered provider applications. Imports happen only when
            requested; temporary access tokens stay in memory. Disconnect removes the session, not
            already saved local events. Clear the schedule to delete saved imports.
          </p>
          <div className="action-row">
            <button
              disabled={!microsoftConfigured || busy || Boolean(sample)}
              onClick={() =>
                void run(async () => {
                  await connectMicrosoft()
                  const list = await microsoftCalendars()
                  setCalendars(list)
                  setCalendar(list[0]?.id ?? '')
                  setNotice(
                    'Microsoft permission granted. Choose a calendar and explicitly import a date range.',
                  )
                })
              }
            >
              Connect Microsoft Outlook
            </button>
            <button
              onClick={() => {
                disconnectMicrosoft()
                setCalendars([])
                setNotice(
                  'Microsoft disconnected. You can also revoke consent in your Microsoft account.',
                )
              }}
            >
              Disconnect Microsoft
            </button>
            <button
              disabled={!googleConfigured || busy || Boolean(sample)}
              onClick={() =>
                void run(async () => {
                  await connectGoogle()
                  setGoogleConnected(true)
                  setNotice(
                    'Google permission granted. Explicitly import the selected date range from your primary calendar.',
                  )
                })
              }
            >
              Connect Google Calendar
            </button>
            <button
              onClick={() => {
                disconnectGoogle()
                setGoogleConnected(false)
                setNotice('Google disconnected. Saved imports remain until you clear them.')
              }}
            >
              Disconnect Google
            </button>
            {googleConnected && (
              <button
                onClick={() =>
                  void run(async () => {
                    await revokeGoogle()
                    setGoogleConnected(false)
                    setNotice(
                      'Google token cleared and consent revocation requested. Saved imports remain local.',
                    )
                  })
                }
              >
                Revoke Google consent
              </button>
            )}
          </div>
          {!microsoftConfigured && (
            <p>
              Microsoft app registration is not configured. ICS import works without credentials.
              See docs/calendar-and-locations.md.
            </p>
          )}
          <p>
            {googleConfigured
              ? 'Google reads your primary calendar only, with read-only consent and a temporary memory-only token.'
              : 'Google OAuth app registration is not configured. Local Google ICS exports work without credentials.'}
          </p>
          {googleConnected && (
            <button
              disabled={busy || Boolean(sample)}
              onClick={() =>
                void run(async () => {
                  setPreview({
                    events: await importGoogle(from, through),
                    warnings: ['Review imported categories and campus buildings before saving.'],
                  })
                  setReplace(false)
                })
              }
            >
              Import / refresh Google primary calendar
            </button>
          )}
          {calendars.length > 0 && (
            <>
              <label>
                Microsoft calendar
                <select value={calendar} onChange={(e) => setCalendar(e.target.value)}>
                  {calendars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={busy || !calendar}
                onClick={() =>
                  void run(async () => {
                    setPreview({
                      events: await importMicrosoft(calendar, from, through),
                      warnings: ['Review categories and campus buildings before saving.'],
                    })
                    setReplace(false)
                  })
                }
              >
                Import / refresh selected calendar
              </button>
            </>
          )}
        </details>
        {preview && (
          <div className="import-review">
            <h3>Review import · nothing saved yet</h3>
            <p>
              {preview.events.length} occurrences. Imports start unclassified, not automatically as
              classes. Edit buildings and mark only actual classes. Recurrences are expanded only
              within your selected range.
            </p>
            {preview.warnings.map((w, i) => (
              <p role="status" key={i}>
                {w}
              </p>
            ))}
            {preview.events.map((event) => (
              <fieldset key={event.id}>
                <legend>
                  {event.title} · {event.allDay ? 'All day' : clock(event.start)} ·{' '}
                  {inZone(event.start).toPlainDate().toString()}
                </legend>
                <div className="form-grid">
                  <label>
                    Imported title
                    <input
                      value={event.title}
                      onChange={(e) => updatePreview(event.id, { title: e.target.value })}
                    />
                  </label>
                  <label>
                    Imported building
                    <input
                      list="schedule-buildings"
                      value={event.location}
                      onChange={(e) => updatePreview(event.id, { location: e.target.value })}
                    />
                  </label>
                  <label>
                    Imported category
                    <select
                      value={event.category}
                      onChange={(e) =>
                        updatePreview(event.id, {
                          category: e.target.value as CalendarEvent['category'],
                        })
                      }
                    >
                      <option value="unclassified">Unclassified</option>
                      <option value="class" disabled={event.allDay}>
                        Class
                      </option>
                      <option value="other">Other event</option>
                    </select>
                  </label>
                </div>
                <button
                  onClick={() =>
                    setPreview((p) =>
                      p ? { ...p, events: p.events.filter((e) => e.id !== event.id) } : p,
                    )
                  }
                >
                  Remove from import
                </button>
                <p>
                  Times: {event.start} to {event.end}. Correct times using Edit after saving; these
                  are not yet used for recommendations.
                </p>
              </fieldset>
            ))}
            <label>
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
              />
              Replace {sample ? 'sample' : 'actual local'} schedule instead of adding (destructive;
              requires confirmation)
            </label>
            <div className="action-row">
              <button
                disabled={!ready || busy || preview.events.length === 0}
                className="calendar-primary"
                onClick={() => {
                  if (
                    replace &&
                    !window.confirm(
                      'Replace the current local schedule with these reviewed records?',
                    )
                  )
                    return
                  void run(async () => {
                    const base = replace ? [] : (sample ?? events),
                      value = mergeEvents(base, preview.events),
                      added = value.length - base.length
                    await persist(value)
                    setPreview(null)
                    setNotice(`${added} reviewed events saved; duplicates skipped.`)
                  })
                }}
              >
                Save reviewed import
              </button>
              <button onClick={() => setPreview(null)}>Discard import preview</button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
