import { describe, it, expect } from 'vitest'
import {
  manualEvent,
  occurrences,
  mergeEvents,
  overlaps,
  localInstant,
  weekDays,
  sampleSchedule,
  validateStoredSchedule,
  type ManualDraft,
} from './model'
import { parseICS } from './ics'
import { parseScheduleText, validateScreenshot } from './screenshot'
import { connectMicrosoft, microsoftConfigured, importMicrosoft } from './providers'
import { connectGoogle, googleConfigured, importGoogle } from './google'
const draft: ManualDraft = {
  title: 'CSCI 101',
  section: '1',
  date: '2026-10-26',
  until: '2026-11-09',
  start: '09:00',
  end: '10:00',
  days: [1],
  location: 'Leavey Library',
  buildingCode: 'LVL',
  room: '201',
  notes: '',
  category: 'class',
}
const wrap = (events: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Respite test//EN\r\n${events}\r\nEND:VCALENDAR`
const event = (lines: string) => `BEGIN:VEVENT\r\n${lines}\r\nEND:VEVENT`
describe('local schedule model', () => {
  it('preserves weekly wall times across fall DST', () => {
    const e = manualEvent(draft),
      all = occurrences([e], '2026-10-26', '2026-11-09')
    expect(all.map((e) => e.start)).toEqual([
      '2026-10-26T16:00:00Z',
      '2026-11-02T17:00:00Z',
      '2026-11-09T17:00:00Z',
    ])
  })
  it('validates title, times, range and nonexistent DST times', () => {
    expect(() => manualEvent({ ...draft, title: '' })).toThrow()
    expect(() => manualEvent({ ...draft, end: '08:00' })).toThrow()
    expect(() => manualEvent({ ...draft, until: '2026-01-01' })).toThrow()
    expect(() => localInstant('2026-03-08', '02:30')).toThrow()
    expect(() => localInstant('2026-11-01', '01:30')).toThrow()
  })
  it('detects duplicate events and overlaps without changing originals', () => {
    const a = manualEvent(draft),
      b = manualEvent({ ...draft, title: 'Other', start: '09:30', end: '11:00' })
    expect(mergeEvents([a], [manualEvent(draft)])).toHaveLength(1)
    expect(overlaps([a, b])).toBe(true)
    expect(overlaps(sampleSchedule())).toBe(false)
  })
  it('returns a Monday–Sunday week and separates nonrecurring dates', () => {
    expect(weekDays('2026-10-21')).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ])
    expect(occurrences(sampleSchedule(), '2026-10-26', '2026-11-01')).toEqual([])
  })
  it('retains source metadata when editing', () => {
    const a = { ...manualEvent(draft), source: 'ics' as const, sourceEventId: 'original' }
    expect(manualEvent({ ...draft, title: 'Corrected' }, a)).toMatchObject({
      id: a.id,
      source: 'ics',
      sourceEventId: 'original',
    })
  })
  it('does not load corrupt local records or overwrite them silently', () => {
    expect(() => validateStoredSchedule([{ id: 'bad' }])).toThrow()
    expect(validateStoredSchedule(sampleSchedule())).toHaveLength(2)
  })
})
describe('bounded real ICS parsing', () => {
  it('expands RRULE with EXDATE and RDATE, preserving DST', () => {
    const text = wrap(
      event(
        'UID:weekly\r\nSUMMARY:Class\r\nLOCATION:LVL\r\nDTSTART;TZID=America/Los_Angeles:20261026T090000\r\nDTEND;TZID=America/Los_Angeles:20261026T100000\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nEXDATE;TZID=America/Los_Angeles:20261102T090000\r\nRDATE;TZID=America/Los_Angeles:20261104T090000',
      ),
    )
    const p = parseICS(text, '2026-10-25', '2026-11-10')
    expect(p.warnings).toEqual([])
    expect(p.events.map((e) => e.start)).toEqual([
      '2026-10-26T16:00:00Z',
      '2026-11-04T17:00:00Z',
      '2026-11-09T17:00:00Z',
    ])
    expect(p.events.every((e) => e.category === 'unclassified')).toBe(true)
  })
  it('handles cancelled masters and all-day records without classifying as classes', () => {
    const p = parseICS(
      wrap(
        event(
          'UID:cancel\r\nSTATUS:CANCELLED\r\nDTSTART:20261026T160000Z\r\nDTEND:20261026T170000Z',
        ) +
          '\r\n' +
          event(
            'UID:holiday\r\nSUMMARY:Holiday\r\nDTSTART;VALUE=DATE:20261026\r\nDTEND;VALUE=DATE:20261027',
          ),
      ),
      '2026-10-25',
      '2026-11-10',
    )
    expect(p.events).toHaveLength(1)
    expect(p.events[0]).toMatchObject({ allDay: true, category: 'unclassified' })
  })
  it('applies recurrence overrides and cancellation exceptions', () => {
    const base = event(
      'UID:series\r\nSUMMARY:Original\r\nDTSTART;TZID=America/Los_Angeles:20261026T090000\r\nDTEND;TZID=America/Los_Angeles:20261026T100000\r\nRRULE:FREQ=DAILY;COUNT=3',
    )
    const moved = event(
      'UID:series\r\nRECURRENCE-ID;TZID=America/Los_Angeles:20261027T090000\r\nSUMMARY:Moved\r\nDTSTART;TZID=America/Los_Angeles:20261027T110000\r\nDTEND;TZID=America/Los_Angeles:20261027T120000',
    )
    const cancelled = event(
      'UID:series\r\nRECURRENCE-ID;TZID=America/Los_Angeles:20261028T090000\r\nSTATUS:CANCELLED\r\nDTSTART;TZID=America/Los_Angeles:20261028T090000\r\nDTEND;TZID=America/Los_Angeles:20261028T100000',
    )
    const p = parseICS(wrap([base, moved, cancelled].join('\r\n')), '2026-10-25', '2026-11-10')
    expect(p.events).toHaveLength(2)
    expect(p.events[1].title).toBe('Moved')
    expect(p.events[1].start).toBe('2026-10-27T18:00:00Z')
  })
  it('deduplicates, decodes folded text and warns on floating times', () => {
    const raw = event(
      'UID:same\r\nSUMMARY:Long title\r\n continued\r\nLOCATION:Leavey Library\r\nDTSTART:20261026T090000\r\nDTEND:20261026T100000',
    )
    const p = parseICS(wrap(raw + '\r\n' + raw), '2026-10-25', '2026-11-10')
    expect(p.events).toHaveLength(1)
    expect(p.events[0].title).toBe('Long titlecontinued')
    expect(p.warnings.join()).toMatch(/Floating/)
  })
  it('skips cancellation-only recurrence exceptions without losing subsequent classes', () => {
    const p = parseICS(
      wrap(
        event(
          'UID:cancel-only\r\nSUMMARY:Class\r\nDTSTART;TZID=America/Los_Angeles:20261026T090000\r\nDTEND;TZID=America/Los_Angeles:20261026T100000\r\nRRULE:FREQ=DAILY;COUNT=3',
        ) +
          '\r\n' +
          event(
            'UID:cancel-only\r\nRECURRENCE-ID;TZID=America/Los_Angeles:20261027T090000\r\nSTATUS:CANCELLED',
          ),
      ),
      '2026-10-25',
      '2026-10-30',
    )
    expect(p.events.map((e) => e.start)).toEqual(['2026-10-26T16:00:00Z', '2026-10-28T16:00:00Z'])
    expect(p.warnings).toEqual([])
  })
  it('rejects oversize, unsupported and unbounded import ranges', () => {
    expect(() => parseICS('x'.repeat(2 * 1024 * 1024 + 1), '2026-10-01', '2026-10-31')).toThrow(
      /2 MB/,
    )
    expect(() => parseICS('not a calendar', '2026-10-01', '2026-10-31')).toThrow()
    expect(() => parseICS(wrap(''), '2026-01-01', '2026-12-01')).toThrow(/120/)
    const p = parseICS(
      wrap(
        event(
          'UID:fast\r\nDTSTART:20261026T090000Z\r\nDTEND:20261026T100000Z\r\nRRULE:FREQ=SECONDLY',
        ),
      ),
      '2026-10-01',
      '2026-10-31',
    )
    expect(p.events).toEqual([])
    expect(p.warnings.join()).toMatch(/High-frequency/)
  })
  it('handles spring DST and rejects unknown time zones rather than guessing', () => {
    const p = parseICS(
      wrap(
        event(
          'UID:spring\r\nDTSTART;TZID=America/Los_Angeles:20260302T090000\r\nDTEND;TZID=America/Los_Angeles:20260302T100000\r\nRRULE:FREQ=WEEKLY;COUNT=2',
        ),
      ),
      '2026-03-01',
      '2026-03-15',
    )
    expect(p.events.map((e) => e.start)).toEqual(['2026-03-02T17:00:00Z', '2026-03-09T16:00:00Z'])
    const bad = parseICS(
      wrap(
        event(
          'UID:unknown\r\nDTSTART;TZID=Imaginary/Zone:20261026T090000\r\nDTEND;TZID=Imaginary/Zone:20261026T100000',
        ),
      ),
      '2026-10-01',
      '2026-10-31',
    )
    expect(bad.events).toHaveLength(0)
    expect(bad.warnings.length).toBeGreaterThan(0)
  })
})
describe('optional providers and OCR', () => {
  it('never invents screenshot fields; accepts explicit rows only', () => {
    expect(parseScheduleText('CSCI Monday? 9ish somewhere', '2026-10-19').events).toEqual([])
    expect(
      parseScheduleText('CSCI | Mon,Wed | 09:00-10:15 | LVL | 201', '2026-10-19').events[0],
    ).toMatchObject({ source: 'screenshot', category: 'unclassified', room: '201' })
  })
  it('validates image format and size', () => {
    expect(() =>
      validateScreenshot(new File(['x'], 'a.pdf', { type: 'application/pdf' })),
    ).toThrow()
    expect(() =>
      validateScreenshot(
        new File(['x'.repeat(5 * 1024 * 1024 + 1)], 'a.png', { type: 'image/png' }),
      ),
    ).toThrow()
    expect(() =>
      validateScreenshot(new File(['x'], 'a.webp', { type: 'image/webp' })),
    ).not.toThrow()
  })
  it('has no simulated provider authentication when unconfigured', async () => {
    expect(microsoftConfigured).toBe(false)
    expect(googleConfigured).toBe(false)
    await expect(connectGoogle()).rejects.toThrow(/not configured/)
    await expect(importGoogle('2026-10-19', '2026-10-20')).rejects.toThrow(/Connect Google/)
    await expect(connectMicrosoft()).rejects.toThrow(/not configured/)
    await expect(importMicrosoft('primary', '2026-10-19', '2026-10-20')).rejects.toThrow(
      /Connect Microsoft/,
    )
  })
})
