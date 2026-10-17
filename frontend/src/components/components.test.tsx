import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PreferencesPanel } from './PreferencesPanel'
import { RouteCard } from './RouteCard'
import { LocationSelector } from './LocationSelector'
import { DEFAULTS, loadPreferences } from '../preferences'
import { api } from '../services/api'
import type { Point, Route } from '../types'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('preferences', () => {
  it('changes a sensitivity slider', () => {
    const onChange = vi.fn()
    render(<PreferencesPanel value={DEFAULTS} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Noise sensitivity'), { target: { value: '95' } })
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULTS, noise: 95 })
  })
  it('resets all preferences', () => {
    const onChange = vi.fn()
    render(<PreferencesPanel value={{ ...DEFAULTS, noise: 3 }} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Reset preferences'))
    expect(onChange).toHaveBeenCalledWith(DEFAULTS)
  })
  it('rejects corrupted persisted settings', () => {
    localStorage.setItem('neuroroute-preferences', JSON.stringify({ ...DEFAULTS, noise: 101 }))
    expect(loadPreferences()).toEqual(DEFAULTS)
  })
})

it('preserves a typed search draft while invalidating the old selected location', () => {
  function Selector() {
    const [value, setValue] = useState<Point | null>({ name: 'USC Village', lat: 34, lon: -118 })
    return (
      <LocationSelector
        id="start-search"
        label="Search start"
        value={value}
        locations={[]}
        onChange={setValue}
      />
    )
  }
  render(<Selector />)
  fireEvent.change(screen.getByLabelText('Search start'), { target: { value: 'L' } })
  expect(screen.getByLabelText('Search start')).toHaveValue('L')
  fireEvent.change(screen.getByLabelText('Search start'), { target: { value: 'Lea' } })
  expect(screen.getByLabelText('Search start')).toHaveValue('Lea')
})

it('renders calculated route metrics and selection', () => {
  const route = {
    id: 'calmer',
    name: 'Calmer route',
    duration_min: 9.4,
    distance_m: 745.5,
    exposure: 19,
    extra_minutes: 1.9,
    reduction_pct: 76,
  } as Route
  const onSelect = vi.fn()
  render(<RouteCard route={route} selected={true} recommended={true} onSelect={onSelect} />)
  expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('746 m')).toBeInTheDocument()
  expect(screen.getByText('76% lower estimate')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button'))
  expect(onSelect).toHaveBeenCalledOnce()
})

describe('API', () => {
  it('handles a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ routes: [] }) }),
    )
    await expect(api('/routes', {})).resolves.toEqual({ routes: [] })
  })
  it('shows backend error details', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          json: async () => ({ detail: 'No walking path nearby.' }),
        }),
    )
    await expect(api('/routes', {})).rejects.toThrow('No walking path nearby.')
  })
  it('gives useful connection errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    await expect(api('/routes', {})).rejects.toThrow('backend is running')
  })
})
