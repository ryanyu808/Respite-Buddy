import { expect, it } from 'vitest'
import { DEMO_LOCATIONS } from './demoJourney'
import { homeRecommendations } from './homeRecommendations'
import { DEMO_TIME } from '../respite'
import { DEFAULTS } from '../preferences'

it('serves every listed origin/destination pair in both indoor and outdoor settings', () => {
  let checked = 0
  for (const start of DEMO_LOCATIONS)
    for (const next of DEMO_LOCATIONS)
      for (const indoor of [true, false]) {
        const response = homeRecommendations({
          near: start,
          next_class: next,
          minutes: 240,
          needs: [indoor ? 'indoor' : 'outdoor'],
          demo: true,
          demo_time: DEMO_TIME,
          usc_id: false,
          preferences: DEFAULTS,
        })
        expect(response, `${start.name} → ${next.name}`).not.toBeNull()
        expect(response!.recommendations.length, `${start.name} → ${next.name}`).toBeGreaterThan(0)
        expect(response!.origin.name).toBe(start.name)
        expect(response!.next_class?.name).toBe(next.name)
        for (const spot of response!.recommendations) {
          expect(spot.spot.indoor).toBe(indoor)
          expect(spot.rest_min).toBeGreaterThan(0)
          expect(spot.walk_to_min + spot.walk_to_class_min! + spot.rest_min).toBeLessThanOrEqual(
            240,
          )
          expect(spot.spot.verified_by).toBeNull()
        }
        checked++
      }
  expect(checked).toBe(DEMO_LOCATIONS.length ** 2 * 2)
})

it('supports the reported JKP → Fisher 75-minute break without Render', () => {
  const response = homeRecommendations({
    near: 'JKP',
    next_class: 'Fisher',
    minutes: 75,
    needs: [],
    demo: true,
    demo_time: DEMO_TIME,
    usc_id: false,
    preferences: DEFAULTS,
  })!
  expect(response.origin.name).toBe('Popovich Hall (JKP)')
  expect(response.next_class?.name).toBe('USC Fisher Museum')
  expect(response.recommendations.length).toBeGreaterThanOrEqual(3)
  for (const spot of response.recommendations) {
    expect(spot.route_to_spot?.notes.join(' ')).toContain('not a verified entrance')
    expect(spot.rest_min).toBe(75 - spot.walk_to_min - spot.walk_to_class_min!)
  }
})
