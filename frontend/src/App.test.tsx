import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'
import { OFFLINE_MESSAGE } from './services/api'
import { SAVED_NOTE } from './data/fallback'

vi.mock('./components/MapView', () => ({ MapView: () => <div>Walking map</div> }))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

it('opens ready to route on bundled data while the backend is still waking', async () => {
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
  render(<App />)
  expect(screen.getByDisplayValue('USC Village')).toBeInTheDocument()
  expect(screen.getByDisplayValue('Leavey Library')).toBeInTheDocument()
  expect(screen.getByText(/Connecting to campus data/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Find My Route' }))
  expect(await screen.findByRole('complementary', { name: 'Route comparison' })).toBeInTheDocument()
  expect(screen.getByText(SAVED_NOTE)).toBeInTheDocument()
})

it('replaces connection errors with a friendly message and a working demo', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
  // A custom preference mix has no saved route, so it needs the backend.
  localStorage.setItem(
    'neuroroute-preferences',
    JSON.stringify({ noise: 55, crowds: 50, traffic: 70, green: 60, pace: 'balanced', max_detour: 30 }),
  )
  render(<App />)
  expect(await screen.findByText('Showing saved demo data')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Find My Route' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(OFFLINE_MESSAGE)
  expect(screen.getByRole('alert')).not.toHaveTextContent(/JSON|token|port 8000/)
  expect(screen.getByRole('button', { name: 'Retry connection' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try the campus demo' }))
  expect(await screen.findByRole('complementary', { name: 'Route comparison' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('validates missing locations', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation((path: string) =>
        Promise.resolve({
          ok: true,
          json: async () => (path.includes('metadata') ? { available: true, source: 'OSM' } : []),
        }),
      ),
  )
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Clear start' }))
  fireEvent.click(screen.getByRole('button', { name: 'Find My Route' }))
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Choose both a start and a destination'),
  )
})
