import { afterEach, describe, it, expect } from 'vitest'
import {
  DEFAULT_FILTERS,
  attributeState,
  matchesFilters,
  loadFilters,
  saveFilters,
  validFilters,
  type DirectorySpot,
} from './smartFilters'
import {
  contextualSuggestion,
  scheduleContext,
  rememberCampus,
  rememberedCampus,
} from './smartContext'
import { sampleSchedule } from './calendar/model'
import data from './data/campus-candidates.json'
import bundle from './data/respite-demo.json'
import { parseDeepLink } from './respite'
import { savedDemo } from './services/respiteApi'
const at = '2026-10-19T13:00:00-07:00'
const scout = {
  ...bundle.response.recommendations[0].spot,
  data_kind: 'scouted',
  verified_by: 'TEST ONLY',
  verified_date: '2026-10-01',
} as DirectorySpot
afterEach(() => localStorage.clear())
describe('strict evidence filters', () => {
  it.each(['outlets', 'food_allowed', 'food_available', 'step_free', 'restroom_nearby'] as const)(
    'keeps %s present, absent and unknown distinct',
    (field) => {
      expect(attributeState({ ...scout, [field]: true }, field)).toBe('present')
      expect(attributeState({ ...scout, [field]: false }, field)).toBe('absent')
      expect(attributeState({ ...scout, [field]: null }, field)).toBe('unknown')
    },
  )
  it('defaults impose no extra restrictions and preferences persist safely', () => {
    expect(matchesFilters(scout, DEFAULT_FILTERS, at)).toBe(true)
    saveFilters({ ...DEFAULT_FILTERS, outlets: true })
    expect(loadFilters().outlets).toBe(true)
    expect(() => validFilters({ indoor: true, outdoor: true })).toThrow()
    expect(() => validFilters({ max_walk_min: -1 })).toThrow()
    expect(() => validFilters({ unknown: true })).toThrow()
  })
  it('restores strict filters in private deep links and never fabricates sample amenities', () => {
    const filters = { ...DEFAULT_FILTERS, outlets: true }
    const link = parseDeepLink('', `#reset=${encodeURIComponent(JSON.stringify({ filters }))}`)
    expect(link.filters).toEqual(filters)
    const result = savedDemo({
      near: 'Leavey',
      next_class: null,
      minutes: 15,
      needs: [],
      demo: true,
      usc_id: false,
      filters,
    })
    expect(result?.response.recommendations).toHaveLength(0)
  })
  it('requires source-specific positive outlet evidence and never calls a candidate scout verified', () => {
    const pod = data.find((p) => p.id === 'lvl-pod-210a') as unknown as DirectorySpot
    expect(matchesFilters(pod, { ...DEFAULT_FILTERS, outlets: true }, at)).toBe(true)
    expect(
      matchesFilters({ ...pod, evidence: null }, { ...DEFAULT_FILTERS, outlets: true }, at),
    ).toBe(false)
    expect(matchesFilters(pod, { ...DEFAULT_FILTERS, verified_only: true }, at)).toBe(false)
  })
  it('distinguishes food sales, food permission and open now', () => {
    const food = data.find((p) => p.id === 'dining-seeds') as unknown as DirectorySpot
    expect(matchesFilters(food, { ...DEFAULT_FILTERS, activity: 'eat' }, at)).toBe(true)
    expect(matchesFilters(food, { ...DEFAULT_FILTERS, food_allowed: true }, at)).toBe(false)
    expect(matchesFilters(food, { ...DEFAULT_FILTERS, open_now: true }, at)).toBe(false)
  })
  it('filters seating, noise, indoor/outdoor and restrictive access', () => {
    const good = {
      ...scout,
      seating: 'soft',
      noise: 'low',
      indoor: true,
      access: 'usc_id',
    } as DirectorySpot
    expect(
      matchesFilters(
        good,
        {
          ...DEFAULT_FILTERS,
          comfortable_seating: true,
          quiet: true,
          indoor: true,
          access: 'usc_id',
        },
        at,
      ),
    ).toBe(true)
    expect(matchesFilters(good, { ...DEFAULT_FILTERS, outdoor: true }, at)).toBe(false)
    expect(matchesFilters(good, { ...DEFAULT_FILTERS, access: 'open' }, at)).toBe(false)
  })
  it('handles overnight hours and excludes unknown walking estimates', () => {
    const spot = { ...scout, hours: { mon: [{ start: '20:00', end: '02:00' }] } }
    expect(
      matchesFilters(spot, { ...DEFAULT_FILTERS, open_now: true }, '2026-10-20T01:00:00-07:00'),
    ).toBe(true)
    expect(
      matchesFilters(spot, { ...DEFAULT_FILTERS, open_now: true }, '2026-10-20T03:00:00-07:00'),
    ).toBe(false)
    expect(matchesFilters(scout, { ...DEFAULT_FILTERS, max_walk_min: 5 }, at)).toBe(false)
    expect(matchesFilters(scout, { ...DEFAULT_FILTERS, max_walk_min: 5 }, at, 5)).toBe(true)
  })
})
describe('optional local context, not a questionnaire', () => {
  it('uses a known next class without claiming the previous class is the user location', () => {
    const value = scheduleContext(sampleSchedule(), at)
    expect(value).toMatchObject({ minutes: 15, next_class: 'TCC' })
    expect(value).not.toHaveProperty('near')
    expect(scheduleContext(sampleSchedule(), '2026-10-19T12:30:00-07:00')).toBeNull()
    const ambiguous = sampleSchedule()
    ambiguous.push({ ...ambiguous[1], id: 'overlap' })
    expect(scheduleContext(ambiguous, at)).toBeNull()
  })
  it('offers one suggestion, preferring class context over lunch', () => {
    const context = scheduleContext(sampleSchedule(), at)
    expect(contextualSuggestion(at, context)?.kind).toBe('between')
    expect(contextualSuggestion(at, null)?.kind).toBe('lunch')
    expect(contextualSuggestion('2026-10-19T20:00:00-07:00', null)?.kind).toBe('evening')
    expect(contextualSuggestion('2026-10-19T15:00:00-07:00', null)).toBeNull()
  })
  it('remembers only selected campus names, never GPS coordinates', () => {
    rememberCampus('TCC')
    expect(rememberedCampus()).toBe('Tutor Campus Center')
    rememberCampus({ lat: 34.02, lon: -118.28, name: 'GPS' })
    expect(rememberedCampus()).toBe('Tutor Campus Center')
  })
})
