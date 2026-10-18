import { describe, expect, it } from 'vitest'
import { BREAK_INTERVALS, breakWindow, timeFields } from './breakTime'
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
describe('explicit Pacific break windows', () => {
  it('prefills times using the current break length, not a different hidden duration', () => {
    expect(timeFields(DEMO_TIME)).toMatchObject({ current: '13:00', classStarts: '13:15' })
    expect(timeFields(DEMO_TIME, 105)).toMatchObject({ current: '13:00', classStarts: '14:45' })
    expect(timeFields('2026-10-19T23:50:00-07:00', 30)).toMatchObject({
      classStarts: '00:20',
      nextDay: true,
    })
  })
  it('calculates actual time before class and requires explicit next-day intent', () => {
    expect(breakWindow('2026-10-19', '13:10', '13:47').minutes).toBe(37)
    expect(() => breakWindow('2026-10-19', '23:50', '00:20')).toThrow('End time must be after')
    expect(breakWindow('2026-10-19', '23:50', '00:20', true).minutes).toBe(30)
    expect(() => breakWindow('2026-10-19', '13:00', '13:00')).toThrow()
    expect(() => breakWindow('2026-10-19', '13:00', '18:00')).toThrow('4 hours')
  })
  it('supports every compatible combination of the six visible preferences offline', () => {
    const optional: ResetRequest['needs'] = ['quiet', 'seated', 'dim', 'few_people']
    for (let mask = 0; mask < 16; mask++) {
      for (const setting of [[], ['indoor'], ['outdoor']] as ResetRequest['needs'][]) {
        const needs = [...optional.filter((_, index) => mask & (1 << index)), ...setting]
        const result = savedDemo({ ...request, minutes: 105, needs })!
        expect(result).not.toBeNull()
        expect(result.response.recommendations.length).toBeGreaterThan(0)
        for (const item of result.response.recommendations) {
          expect(item.spot.data_kind).toBe('illustrative')
          expect(item.spot.verified_by).toBeNull()
          expect(item.crowd.category).toBeNull()
          expect(item.rest_min).toBe(105 - item.walk_to_min - item.walk_to_class_min!)
          if (needs.includes('dim')) expect(item.spot.lighting).toBe('dim')
          if (needs.includes('few_people')) expect(item.spot.typical_crowd).toBe('few')
        }
      }
    }
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
