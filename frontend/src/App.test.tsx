import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'
import { savedDemo } from './services/respiteApi'
import { DEFAULTS } from './preferences'

vi.mock('./components/MapView', () => ({ MapView: () => <div>Walking map</div> }))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
  vi.restoreAllMocks()
})

it('opens on reset before class with zero setup and no account', () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  )
  render(<App />)
  expect(screen.getByRole('heading', { name: /Reset before class/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Somewhere calm, now' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '15 min' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('link', { name: 'Need more support?' })).toHaveAttribute(
    'href',
    'https://studenthealth.usc.edu/mental-health-and-well-being/',
  )
})

it('keeps saved demos usable while a live search is pending and ignores its stale response', async () => {
  let resolveLive: (value: unknown) => void = () => {}
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string) =>
      path.endsWith('/reset-spots')
        ? new Promise((resolve) => {
            resolveLive = resolve
          })
        : new Promise(() => {}),
    ),
  )
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Somewhere calm, now' }))
  expect(screen.getByRole('button', { name: 'Finding your pause…' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Try the demo' }))
  expect(await screen.findByText('Saved demonstration (works offline)')).toBeInTheDocument()
  expect(screen.getAllByRole('article')).toHaveLength(3)
  resolveLive({ ok: true, json: async () => ({ recommendations: [], notes: [] }) })
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3))
})

it('recalculates time and needs, persists display preferences and clears them in one tap', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Try the demo' }))
  await screen.findByText('Saved demonstration (works offline)')
  fireEvent.click(screen.getByRole('button', { name: '10 min' }))
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3))
  expect(screen.getAllByText('Tight on time.').length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: 'Quiet' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Quiet' })).toHaveAttribute('aria-pressed', 'true'),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Toggle high contrast' }))
  expect(JSON.parse(localStorage.getItem('respite-buddy-preferences')!)).toMatchObject({
    minutes: 10,
    needs: ['quiet'],
    highContrast: true,
  })
  fireEvent.click(screen.getByText('Fine-tune', { exact: false, selector: 'summary' }))
  fireEvent.click(screen.getByRole('button', { name: 'Clear saved preferences' }))
  expect(screen.getByRole('button', { name: '15 min' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Quiet' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: 'Toggle high contrast' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})

it('hides full and locked places for this session, keeps source labels and allows calendar preview', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Preview calendar' }))
  expect(screen.getByText('Simulated calendar · not connected')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try this sample break' }))
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3))
  expect(screen.queryByText('Verified by scouts', { exact: true })).not.toBeInTheDocument()
  expect(screen.getAllByText('Crowd information unavailable.')).toHaveLength(3)
  fireEvent.click(screen.getAllByRole('button', { name: 'It’s full' })[0])
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
  fireEvent.click(screen.getAllByRole('button', { name: 'It’s locked' })[0])
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1))
  expect(JSON.parse(sessionStorage.getItem('respite-buddy-exclusions')!)).toHaveLength(2)
})

it('preserves the walking planner and immediate saved campus route while offline', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Plan a walk' }))
  expect(screen.getByRole('button', { name: 'Find My Route' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Try a campus demo' }))
  expect(await screen.findByLabelText('Route comparison')).toBeInTheDocument()
  expect(screen.getByText('Model details · geographic proxies')).toBeInTheDocument()
  expect(screen.getByText(/Saved demo result/, { selector: '.sr-only' })).toBeInTheDocument()
})

it('preserves the original deadline across a live swap and displays the remaining window', async () => {
  const replay = savedDemo({
    near: 'Leavey',
    next_class: null,
    minutes: 15,
    needs: [],
    demo: true,
    usc_id: false,
    preferences: DEFAULTS,
  })!
  const response = {
    ...replay.response,
    mode: 'live',
    minutes: 8,
    deadline: '2026-10-19T13:15:00-07:00',
  }
  const fetch = vi
    .fn()
    .mockImplementation((path: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          path.endsWith('/reset-spots/swap')
            ? { ...response, recommendations: response.recommendations.slice(1) }
            : path.endsWith('/reset-spots')
              ? response
              : path.includes('metadata')
                ? { available: true }
                : [],
      }),
    )
  vi.stubGlobal('fetch', fetch)
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Somewhere calm, now' }))
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3))
  expect(screen.getByText(/8 minutes remain/)).toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: 'It’s full' })[0])
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
  const swapCall = fetch.mock.calls.find(([path]) => String(path).endsWith('/reset-spots/swap'))
  expect(JSON.parse(swapCall![1].body).request.deadline).toBe(response.deadline)
  fireEvent.click(screen.getByRole('button', { name: '20 min' }))
  await waitFor(() =>
    expect(fetch.mock.calls.filter(([path]) => String(path).endsWith('/reset-spots'))).toHaveLength(
      2,
    ),
  )
  const lastSearch = fetch.mock.calls
    .filter(([path]) => String(path).endsWith('/reset-spots'))
    .at(-1)!
  expect(JSON.parse(lastSearch[1].body).deadline).toBeUndefined()
})

it('handles an already-at-spot result without inventing a walking geometry', async () => {
  const replay = savedDemo({
    near: 'Leavey',
    next_class: null,
    minutes: 15,
    needs: [],
    demo: true,
    usc_id: false,
    preferences: DEFAULTS,
  })!
  const response = {
    ...replay.response,
    mode: 'live',
    recommendations: [
      { ...replay.response.recommendations[0], route_to_spot: null, walk_to_min: 0 },
    ],
  }
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          path.endsWith('/reset-spots')
            ? response
            : path.includes('metadata')
              ? { available: true }
              : [],
      }),
    ),
  )
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Somewhere calm, now' }))
  expect(await screen.findByLabelText('Already at reset spot')).toHaveTextContent(
    'no outdoor walking leg is needed',
  )
  expect(screen.queryByText('Walking map')).not.toBeInTheDocument()
})

it('counts a first full report once and separates demo first-try outcomes from later swaps', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Try the demo' }))
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3))
  fireEvent.click(screen.getAllByRole('button', { name: 'It’s full' })[0])
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
  fireEvent.click(screen.getAllByRole('button', { name: 'It’s full' })[0])
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1))
  const summary = screen.getByText('First recommendation feedback')
  fireEvent.click(summary)
  expect(summary.parentElement).toHaveTextContent(
    'Demonstration: 0 first suggestions accepted; 1 first suggestions full.',
  )
  fireEvent.click(screen.getByRole('button', { name: 'This spot works for me' }))
  expect(summary.parentElement).toHaveTextContent(
    '0 first suggestions accepted; 1 first suggestions full.',
  )
})
