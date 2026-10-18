import { expect, it } from 'vitest'
import { homeRecommendations } from './homeRecommendations'
import { DEFAULTS } from '../preferences'
import { DEMO_TIME, type ResetRequest } from '../respite'
const base: ResetRequest = {
  near: 'Leavey',
  next_class: 'TCC',
  minutes: 15,
  needs: [],
  demo: true,
  demo_time: DEMO_TIME,
  usc_id: false,
  preferences: DEFAULTS,
}

it('ranks a complete pool, and gives genuinely different nearby and longer-break picks', () => {
  const short = homeRecommendations(base)!
  const medium = homeRecommendations({ ...base, minutes: 30 })!
  const long = homeRecommendations({ ...base, minutes: 60 })!
  const ids = (result: typeof short) => result.recommendations.slice(0, 3).map((r) => r.spot.id)
  expect(long.recommendations.length).toBeGreaterThan(3)
  expect(ids(short)).not.toEqual(ids(medium))
  expect(ids(medium)).not.toEqual(ids(long))
  for (const result of [short, medium, long])
    for (const r of result.recommendations) {
      expect(r.rest_min).toBe(result.minutes - r.walk_to_min - r.walk_to_class_min!)
      expect(r.rest_min).toBeGreaterThan(0)
      expect(r.spot.data_kind).toBe('illustrative')
      expect(r.spot.verified_by).toBeNull()
      expect(r.crowd.category).toBeNull()
    }
})

it('has more than three indoor choices and reranks them rather than toggling user preferences', () => {
  const short = homeRecommendations({ ...base, needs: ['indoor'], minutes: 15 })!
  const long = homeRecommendations({ ...base, needs: ['indoor'], minutes: 60 })!
  expect(long.recommendations.length).toBeGreaterThan(3)
  expect(short.recommendations.slice(0, 3).map((r) => r.spot.id)).not.toEqual(
    long.recommendations.slice(0, 3).map((r) => r.spot.id),
  )
  expect(long.recommendations.every((r) => r.spot.indoor)).toBe(true)
})

it('accounts for closing, class walks, no destination, exclusions and unconnected points', () => {
  const noClass = homeRecommendations({ ...base, next_class: null })!
  expect(
    noClass.recommendations.every(
      (r) => r.walk_to_class_min === null && r.rest_min === 15 - r.walk_to_min,
    ),
  ).toBe(true)
  const closing = homeRecommendations({
    ...base,
    minutes: 60,
    demo_time: '2026-10-19T18:50:00-07:00',
  })!
  expect(
    closing.recommendations.every(
      (r) => Date.parse(r.leave_by) <= Date.parse('2026-10-19T19:00:00-07:00'),
    ),
  ).toBe(true)
  expect(
    homeRecommendations({ ...base, demo_time: '2026-10-19T21:00:00-07:00' })?.recommendations,
  ).toHaveLength(0)
  expect(homeRecommendations({ ...base, near: 'JKP' })).toBeNull()
  expect(homeRecommendations({ ...base, near: 'Imaginary Hall' })).toBeNull()
  expect(homeRecommendations({ ...base, demo: false })).toBeNull()
  const first = noClass.recommendations[0]
  const swap = homeRecommendations({
    ...base,
    next_class: null,
    exclusions: [{ spot_id: first.spot.id, until: new Date(Date.now() + 60000).toISOString() }],
  })!
  expect(swap.deadline).toBe(noClass.deadline)
  expect(swap.recommendations.some((r) => r.spot.id === first.spot.id)).toBe(false)
})
