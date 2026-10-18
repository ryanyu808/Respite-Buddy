import { describe, expect, it } from 'vitest'
import { BREAK_INTERVALS, breakLabel, breakWindow } from './breakTime'
import { savedDemo } from './services/respiteApi'
import { DEFAULTS } from './preferences'
import { DEMO_TIME, type ResetRequest } from './respite'
import { DEFAULT_FILTERS } from './smartFilters'

const request: ResetRequest = {
  near: 'Leavey',
  next_class: 'TCC',
  minutes: 15,
  needs: [],
  demo: true,
  usc_id: false,
  preferences: { ...DEFAULTS },
}
describe('break presets and explicit Pacific clocks', () => {
  it('offers only the four requested presets', () => {
    expect(BREAK_INTERVALS.map(breakLabel)).toEqual(['15 min', '30 min', '45 min', '1 hour'])
  })
  it('calculates actual time before class and requires explicit next-day intent', () => {
    expect(breakWindow('2026-10-19', '13:10', '13:47').minutes).toBe(37)
    expect(() => breakWindow('2026-10-19', '23:50', '00:20')).toThrow('Class must start after')
    expect(breakWindow('2026-10-19', '23:50', '00:20', true).minutes).toBe(30)
    expect(() => breakWindow('2026-10-19', '13:00', '13:00')).toThrow()
    expect(() => breakWindow('2026-10-19', '13:00', '18:00')).toThrow('4 hours')
  })
  it('rejects nonexistent/ambiguous daylight saving times, not silently shifting a class', () => {
    expect(() => breakWindow('2026-03-08', '02:10', '03:20')).toThrow()
    expect(() => breakWindow('2026-11-01', '01:10', '02:20')).toThrow()
  })
  it('serves all four intervals and indoor combinations from real cached routes', () => {
    for (const minutes of BREAK_INTERVALS) {
      for (const needs of [
        [],
        ['indoor'],
        ['quiet', 'indoor'],
        ['seated', 'indoor'],
      ] as ResetRequest['needs'][]) {
        const result = savedDemo({ ...request, minutes, needs })!
        expect(result.response.recommendations).toHaveLength(3)
        for (const item of result.response.recommendations) {
          expect(item.rest_min).toBe(minutes - item.walk_to_min - item.walk_to_class_min!)
          if (needs.includes('indoor')) expect(item.spot.indoor).toBe(true)
          expect(item.spot.verified_by).toBeNull()
        }
      }
    }
  })
  it('reuses route geometry for custom clocks, caps closing and keeps deadlines on swaps', () => {
    const clock = '2026-10-19T14:10:00-07:00'
    const deadline = '2026-10-19T14:47:00-07:00'
    const result = savedDemo({ ...request, demo_time: clock, minutes: 37, deadline })!
    expect(result.response.minutes).toBe(37)
    expect(Date.parse(result.response.deadline)).toBe(Date.parse(deadline))
    expect(result.response.recommendations).toHaveLength(3)
    const item = result.response.recommendations[0]
    expect(item.rest_min).toBe(37 - item.walk_to_min - item.walk_to_class_min!)
    const fragment = JSON.parse(decodeURIComponent(new URL(item.deep_link).hash.slice(7)))
    expect(Date.parse(fragment.deadline)).toBe(Date.parse(deadline))
    const original = savedDemo(request)!.response.recommendations.find(
      (r) => r.spot.id === item.spot.id,
    )!
    expect(item.route_to_spot).toEqual(original.route_to_spot)
    const closing = savedDemo({ ...request, demo_time: '2026-10-19T18:50:00-07:00', minutes: 60 })!
    expect(
      closing.response.recommendations.every(
        (r) => Date.parse(r.leave_by) <= Date.parse('2026-10-19T19:00:00-07:00'),
      ),
    ).toBe(true)
    expect(
      savedDemo({ ...request, demo_time: '2026-10-19T21:00:00-07:00' })?.response.recommendations,
    ).toHaveLength(0)
    expect(
      savedDemo({
        ...request,
        filters: { ...DEFAULT_FILTERS, indoor: true },
      })?.response.recommendations.every((r) => r.spot.indoor),
    ).toBe(true)
    expect(
      savedDemo({
        ...request,
        demo_time: clock,
        minutes: 37,
        deadline,
        exclusions: [{ spot_id: item.spot.id, until: new Date(Date.now() + 60000).toISOString() }],
      })?.response.recommendations,
    ).toHaveLength(2)
    expect(Date.parse(DEMO_TIME)).toBeLessThan(Date.parse(clock))
  })
})
