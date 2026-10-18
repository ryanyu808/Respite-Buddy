import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  activeExclusions,
  crowdLabel,
  DEMO_TIME,
  DEVICE_DEFAULTS,
  loadDevicePreferences,
  parseDeepLink,
  resolveBuilding,
  saveDevicePreferences,
  type ResetRequest,
} from './respite'
import { engineRequest, findResetSpots, savedDemo, swapResetSpot } from './services/respiteApi'
import { DEFAULTS } from './preferences'
import { FALLBACK } from './data/fallback'

const base: ResetRequest = {
  near: 'Leavey',
  next_class: null,
  minutes: 15,
  needs: [],
  demo: true,
  usc_id: false,
  preferences: DEFAULTS,
}
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  vi.useRealTimers()
})

describe('validated links and preferences', () => {
  it('restores engine links, coordinates, time, and needs without Location-only fields', () => {
    const link = parseDeepLink(
      '?to=demo-way-123&from=34.02,-118.28&next=TCC&minutes=12&needs=quiet,seated&demo=1',
    )
    expect(link).toMatchObject({
      near: { lat: 34.02, lon: -118.28 },
      next: 'TCC',
      minutes: 12,
      needs: ['quiet', 'seated'],
      demo: true,
      to: 'demo-way-123',
      notices: [],
    })
    const place = FALLBACK.locations[0]
    expect(Object.keys(resolveBuilding(place.name, [place]))).toEqual(['lat', 'lon', 'name'])
  })
  it('rejects malformed coordinates, unsafe spots, invalid time and unrecognized needs', () => {
    const link = parseDeepLink('?to=<script>&from=91,NaN&next=34,&minutes=-8&needs=quiet,unknown')
    expect(link).toMatchObject({
      near: null,
      next: null,
      minutes: undefined,
      needs: ['quiet'],
      to: null,
    })
    expect(link.notices).toHaveLength(5)
    expect(parseDeepLink('?minutes=15.5').minutes).toBeUndefined()
  })
  it('restores bounded private context and rejects malformed deadlines or preferences', () => {
    const context = {
      deadline: '2026-10-19T13:15:00-07:00',
      usc_id: true,
      preferences: DEFAULTS,
      demo_time: DEMO_TIME,
    }
    expect(
      parseDeepLink('?demo=1', `#reset=${encodeURIComponent(JSON.stringify(context))}`),
    ).toMatchObject(context)
    for (const bad of [
      { ...context, deadline: '2026-10-19T13:15:00' },
      { preferences: { ...DEFAULTS, noise: 500 } },
      { usc_id: 'yes' },
    ]) {
      const link = parseDeepLink('', `#reset=${encodeURIComponent(JSON.stringify(bad))}`)
      expect(link.deadline).toBeUndefined()
      expect(link.preferences).toBeUndefined()
      expect(link.notices).toHaveLength(1)
    }
    expect(parseDeepLink('', `#reset=${'x'.repeat(7000)}`).notices).toHaveLength(1)
  })
  it('persists only device settings and handles malformed or blocked storage', () => {
    const value = { ...DEVICE_DEFAULTS, needs: ['quiet'] as const, highContrast: true }
    saveDevicePreferences({ ...value, needs: [...value.needs] })
    expect(loadDevicePreferences()).toEqual(value)
    localStorage.setItem('respite-buddy-preferences', '{bad')
    expect(loadDevicePreferences()).toEqual(DEVICE_DEFAULTS)
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadDevicePreferences()).toEqual(DEVICE_DEFAULTS)
    spy.mockRestore()
  })
})

describe('honest crowd provenance', () => {
  it('requires category, supported source and observation date', () => {
    expect(crowdLabel({ category: 'few', source: null, observed_at: DEMO_TIME }, DEMO_TIME)).toBe(
      'Crowd information unavailable.',
    )
    expect(crowdLabel({ category: 'few', source: 'Estimate', observed_at: null }, DEMO_TIME)).toBe(
      'Crowd information unavailable.',
    )
    expect(
      crowdLabel({ category: 'few', source: 'verified', observed_at: DEMO_TIME }, DEMO_TIME),
    ).toBe('Crowd information unavailable.')
  })
  it('preserves date-only scout visit provenance without inventing a time', () => {
    expect(
      crowdLabel(
        { category: 'few', source: 'Verified by scouts', observed_at: '2026-10-01' },
        DEMO_TIME,
      ),
    ).toBe('Typical: Few people · Verified by scouts · visited 2026-10-01 (time unknown)')
    expect(
      crowdLabel(
        { category: 'some', source: 'Reported', observed_at: '2026-10-19T12:50:00-07:00' },
        DEMO_TIME,
      ),
    ).toContain('Reported · 10 min before evaluation')
  })
})

describe('saved demos and session exclusions', () => {
  it('returns an exact replay immediately without contacting a sleeping backend', async () => {
    const fetch = vi.fn(() => new Promise(() => {}))
    vi.stubGlobal('fetch', fetch)
    const value = await findResetSpots(base)
    expect(value.saved).toBe(true)
    expect(value.response.recommendations).toHaveLength(3)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('matches every time chip and single need, honest empty results, and 9 PM', () => {
    for (const minutes of [5, 10, 12, 15, 20]) {
      for (const needs of [
        [],
        ['quiet'],
        ['seated'],
        ['outdoor'],
        ['indoor'],
        ['dim'],
        ['few_people'],
      ] as ResetRequest['needs'][])
        expect(savedDemo({ ...base, minutes, needs })).not.toBeNull()
    }
    expect(savedDemo({ ...base, minutes: 5 })?.response.recommendations).toHaveLength(0)
    expect(
      savedDemo({ ...base, demo_time: '2026-10-19T21:00:00-07:00' })?.response.recommendations,
    ).toHaveLength(0)
  })
  it('restores actual coordinate links, including next-class walking legs', () => {
    const initial = savedDemo(base)!
    const linked = savedDemo({ ...base, near: initial.response.origin })
    expect(linked?.response.recommendations).toHaveLength(3)
    const twoLeg = savedDemo({ ...base, next_class: 'TCC' })!
    expect(twoLeg.response.next_class).not.toBeNull()
    expect(twoLeg.response.recommendations.length).toBeGreaterThan(0)
    const byCoordinates = savedDemo({
      ...base,
      near: twoLeg.response.origin,
      next_class: twoLeg.response.next_class,
    })
    expect(byCoordinates?.response.recommendations[0].route_to_class).not.toBeNull()
  })
  it('never substitutes a saved route for unmatched, live, or modified inputs', () => {
    for (const input of [
      { minutes: 7 },
      { demo: false },
      { near: 'JKP' },
      { next_class: 'JKP' },
      { usc_id: true },
      { preferences: { ...DEFAULTS, noise: 1 } },
      { demo_time: '2026-10-19T16:00:00-07:00' },
    ])
      expect(savedDemo({ ...base, ...input })).toBeNull()
  })
  it('replays an exact original deadline but never extends an altered or expired window', () => {
    const deadline = savedDemo(base)!.response.deadline
    expect(savedDemo({ ...base, deadline })).not.toBeNull()
    expect(savedDemo({ ...base, deadline: '2026-10-19T13:10:00-07:00' })).toBeNull()
    expect(savedDemo({ ...base, deadline: '2026-10-19T12:00:00-07:00' })).toBeNull()
  })
  it('swaps locally, updates backups and restores spots when the exclusion expires', async () => {
    const id = savedDemo(base)!.response.recommendations[0].spot.id
    const excluded = {
      ...base,
      exclusions: [{ spot_id: id, until: new Date(Date.now() + 45 * 60000).toISOString() }],
    }
    const value = await swapResetSpot(excluded, id, 'full')
    expect(value.response.recommendations).toHaveLength(2)
    expect(
      value.response.recommendations.every((item) => item.spot.id !== id && item.backup_id !== id),
    ).toBe(true)
    expect(activeExclusions(excluded.exclusions, Date.now() + 46 * 60000)).toHaveLength(0)
    expect(
      savedDemo({
        ...base,
        exclusions: [{ spot_id: id, until: new Date(Date.now() - 1).toISOString() }],
      })?.response.recommendations,
    ).toHaveLength(3)
  })
  it('translates wall-time exclusions to the deterministic engine clock', () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const value = engineRequest({
      ...base,
      exclusions: [{ spot_id: 'spot', until: new Date(now + 20 * 60000).toISOString() }],
    })
    expect(Date.parse(value.exclusions![0].until)).toBe(Date.parse(DEMO_TIME) + 20 * 60000)
    vi.restoreAllMocks()
  })
})
