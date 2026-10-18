import { describe, expect, it } from 'vitest'
import { savedDemo } from './respiteApi'
import { DEMO_LOCATIONS, resolveDemoLocation } from './demoJourney'
import { DEFAULTS } from '../preferences'
import { DEMO_TIME, type ResetRequest } from '../respite'

const base: ResetRequest = {
  near: 'USC Village',
  next_class: 'DML',
  minutes: 60,
  needs: [],
  demo: true,
  demo_time: DEMO_TIME,
  usc_id: false,
  preferences: { ...DEFAULTS },
}

describe('saved campus journeys', () => {
  it('resolves existing names, codes, aliases and exact mapped points', () => {
    expect(DEMO_LOCATIONS.length).toBeGreaterThan(8)
    expect(resolveDemoLocation('  lv.  ')?.name).toBe('Leavey Library')
    expect(resolveDemoLocation('DML')?.name).toBe('Doheny Memorial Library')
    expect(resolveDemoLocation(DEMO_LOCATIONS[0])?.id).toBe(DEMO_LOCATIONS[0].id)
    expect(resolveDemoLocation('Imaginary Hall')).toBeUndefined()
  })

  it('uses the selected endpoints for both real legs, times and private navigation links', () => {
    const response = savedDemo(base)!.response
    expect(response.origin.name).toBe('USC Village')
    expect(response.next_class?.name).toBe('Doheny Memorial Library')
    expect(response.recommendations).toHaveLength(3)
    for (const item of response.recommendations) {
      expect(item.route_to_spot?.snapped_origin.name).toBe('USC Village')
      expect(item.route_to_class?.snapped_destination.name).toBe('Doheny Memorial Library')
      expect(item.rest_min).toBe(60 - item.walk_to_min - item.walk_to_class_min!)
      expect(Date.parse(item.leave_by)).toBe(
        Date.parse(response.deadline) - item.walk_to_class_min! * 60000,
      )
      const link = new URL(item.deep_link)
      expect(link.searchParams.get('from')).toBe(`${response.origin.lat},${response.origin.lon}`)
      expect(link.searchParams.get('next')).toBe(
        `${response.next_class!.lat},${response.next_class!.lon}`,
      )
      expect(item.spot.verified_by).toBeNull()
      expect(item.crowd.category).toBeNull()
      const restored = savedDemo({
        ...base,
        near: response.origin,
        next_class: response.next_class,
      })!
      expect(
        restored.response.recommendations.find((r) => r.spot.id === item.spot.id)?.route_to_spot,
      ).toEqual(item.route_to_spot)
    }
  })

  it('supports combined preferences, null onward legs and original deadlines on exclusion', () => {
    const request: ResetRequest = {
      ...base,
      near: 'STU',
      next_class: 'LV',
      minutes: 105,
      needs: ['indoor', 'quiet', 'seated', 'dim', 'few_people'],
      demo_time: '2026-10-19T10:15:00-07:00',
      deadline: '2026-10-19T12:00:00-07:00',
    }
    const response = savedDemo(request)!.response
    expect(response.recommendations).toHaveLength(3)
    expect(response.recommendations.every((r) => r.spot.indoor)).toBe(true)
    const sameBuilding = response.recommendations.find((r) => r.spot.id === 'demo-lvl-weingart')!
    expect(sameBuilding.walk_to_class_min).toBe(0)
    expect(sameBuilding.route_to_class).toBeNull()
    const backup = response.recommendations[1]
    const swap = savedDemo({
      ...request,
      exclusions: [
        {
          spot_id: response.recommendations[0].spot.id,
          until: new Date(Date.now() + 60000).toISOString(),
        },
      ],
    })!.response
    expect(swap.recommendations).toHaveLength(2)
    expect(swap.deadline).toBe(response.deadline)
    expect(swap.recommendations.find((r) => r.spot.id === backup.spot.id)?.leave_by).toBe(
      backup.leave_by,
    )
  })

  it('does not invent onward travel when the destination is blank', () => {
    const response = savedDemo({ ...base, next_class: null })!.response
    expect(response.next_class).toBeNull()
    expect(response.notes.some((note) => note.includes('provisional'))).toBe(true)
    for (const item of response.recommendations) {
      expect(item.walk_to_class_min).toBeNull()
      expect(item.route_to_class).toBeNull()
      expect(item.rest_min).toBe(60 - item.walk_to_min)
      expect(new URL(item.deep_link).searchParams.has('next')).toBe(false)
    }
  })

  it('never substitutes other endpoints, modified walking preferences or live data', () => {
    for (const update of [
      { near: 'Imaginary Hall' },
      { demo: false },
      { preferences: { ...DEFAULTS, noise: 1 } },
      { usc_id: true },
    ]) {
      expect(savedDemo({ ...base, ...update })).toBeNull()
    }
  })
})
