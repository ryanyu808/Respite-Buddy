import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./components/MapView', () => ({ MapView: () => <div>Walking map</div> }))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

it('shows a loading state until initial data resolves', async () => {
  let resolve: (value: unknown) => void = () => {}
  vi.stubGlobal(
    'fetch',
    vi.fn().mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    ),
  )
  render(<App />)
  expect(screen.getByRole('button', { name: /Loading campus map/ })).toBeDisabled()
  cleanup()
  resolve({ ok: true, json: async () => [] })
})

it('reports a connection failure and offers retry', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
  render(<App />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach NeuroRoute')
  expect(screen.getByRole('button', { name: 'Retry connection' })).toBeInTheDocument()
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
  const button = await screen.findByRole('button', { name: 'Find My Route' })
  fireEvent.click(button)
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Choose both a start and a destination'),
  )
})
