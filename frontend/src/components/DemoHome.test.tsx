import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../App'
import { DemoHome } from './DemoHome'
import { DEFAULT_FILTERS, FILTERS_KEY } from '../smartFilters'
import { readSchedule } from '../calendar/storage'
import { manualEvent, type CalendarEvent } from '../calendar/model'

vi.mock('./MapView', () => ({ MapView: () => <div>Saved walking map</div> }))
vi.mock('../calendar/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../calendar/storage')>()),
  readSchedule: vi.fn(async () => []),
}))
beforeEach(() => {
  vi.mocked(readSchedule).mockReset().mockResolvedValue([])
  window.history.replaceState({}, '', '/')
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  )
  vi.stubGlobal('requestAnimationFrame', () => 0)
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
  sessionStorage.clear()
})

const upcomingClass = () =>
  manualEvent({
    title: 'Private class title',
    section: '',
    date: '2026-10-19',
    until: '',
    start: '13:45',
    end: '14:45',
    days: [],
    location: 'Doheny Memorial Library',
    buildingCode: 'DML',
    room: '',
    notes: '',
    category: 'class',
  })

it('changes both mapped endpoints and uses those names in walking directions', () => {
  render(<DemoHome features={null} onLive={() => {}} />)
  fireEvent.change(screen.getByLabelText('Starting from'), { target: { value: 'USC Village' } })
  fireEvent.change(screen.getByLabelText('Next class / destination'), { target: { value: 'DML' } })
  fireEvent.change(screen.getByLabelText('End time'), { target: { value: '14:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Find me a spot' }))
  expect(screen.getByLabelText('Next class / destination')).toHaveValue('Doheny Memorial Library')
  expect(screen.getByText('USC Village → Doheny Memorial Library')).toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: 'Walk me there' })[0])
  expect(screen.getByText(/Start at USC Village/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Then to class' }))
  expect(
    screen.getByRole('heading', { name: 'On to Doheny Memorial Library.' }),
  ).toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
})

it('allows a blank next destination and handles already-at-spot without a fake route', () => {
  render(<DemoHome features={null} onLive={() => {}} />)
  fireEvent.change(screen.getByLabelText('Next class / destination'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Find me a spot' }))
  expect(screen.getByText(/Onward walking time is not included/)).toBeInTheDocument()
  expect(screen.getAllByText(/Rest until/)).toHaveLength(3)
  fireEvent.click(screen.getByRole('button', { name: 'Indoors' }))
  fireEvent.click(screen.getAllByRole('button', { name: 'Walk me there' })[0])
  expect(screen.getByRole('heading', { name: 'No outdoor walk needed.' })).toBeInTheDocument()
  expect(screen.queryByText('Saved walking map')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Then to class' })).not.toBeInTheDocument()
})

it('rejects unknown or disconnected endpoints without changing the applied route', () => {
  render(<DemoHome features={null} onLive={() => {}} />)
  fireEvent.change(screen.getByLabelText('Starting from'), { target: { value: 'Imaginary Hall' } })
  fireEvent.click(screen.getByRole('button', { name: 'Find me a spot' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Choose a listed campus location')
  expect(screen.getByText('Leavey Library → Tutor Campus Center')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Starting from'), { target: { value: 'JKP' } })
  fireEvent.click(screen.getByRole('button', { name: 'Find me a spot' }))
  expect(screen.getByRole('alert')).toHaveTextContent('No saved walking route connects')
  expect(screen.getByText('Leavey Library → Tutor Campus Center')).toBeInTheDocument()
})

it('autofills only the next class and deadline from the on-device schedule', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-19T13:00:00-07:00'))
  vi.mocked(readSchedule).mockResolvedValue([upcomingClass()])
  await act(async () => {
    render(<DemoHome features={null} onLive={() => {}} />)
  })
  expect(screen.getByLabelText('Starting from')).toHaveValue('Leavey Library')
  expect(screen.getByLabelText('Next class / destination')).toHaveValue('Doheny Memorial Library')
  expect(screen.getByLabelText('End time')).toHaveValue('13:45')
  expect(screen.getByText(/Next destination from your saved schedule/)).toBeInTheDocument()
  expect(screen.getByText(/Default starting point—not your current location/)).toBeInTheDocument()
  expect(screen.queryByText('Private class title')).not.toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
})

it('does not overwrite edits when local schedule loading completes later', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-19T13:00:00-07:00'))
  let resolveSchedule!: (events: CalendarEvent[]) => void
  vi.mocked(readSchedule).mockReturnValue(
    new Promise((resolve) => {
      resolveSchedule = resolve
    }),
  )
  render(<DemoHome features={null} onLive={() => {}} />)
  fireEvent.change(screen.getByLabelText('End time'), { target: { value: '14:00' } })
  fireEvent.change(screen.getByLabelText('Next class / destination'), { target: { value: 'STU' } })
  await act(async () => {
    resolveSchedule([upcomingClass()])
  })
  expect(screen.getByLabelText('Next class / destination')).toHaveValue('STU')
  expect(screen.getByLabelText('End time')).toHaveValue('14:00')
})

it('opens directly onto three sample recommendations while the server never responds', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: /A breather/ })).toBeInTheDocument()
  expect(screen.getAllByRole('article')).toHaveLength(3)
  expect(screen.getAllByRole('button', { name: 'Walk me there' })).toHaveLength(3)
  expect(screen.queryByText('Presentation demo · sample conditions')).not.toBeInTheDocument()
  expect(screen.queryByText(/A few minutes to yourself/)).not.toBeInTheDocument()
  expect(screen.getByLabelText('Start time')).toBeVisible()
  expect(screen.getByLabelText('End time')).toBeVisible()
  expect(screen.getByText(/Default starting point—not your current location/)).toBeInTheDocument()
  expect(screen.getAllByRole('combobox')).toHaveLength(2)
  expect(screen.getByLabelText('Starting from')).toHaveValue('Leavey Library')
  expect(screen.getByLabelText('Next class / destination')).toHaveValue('Tutor Campus Center')
  expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  expect(screen.queryByText('Verified by scouts', { exact: true })).not.toBeInTheDocument()
})

it('uses only the visible start/end window and preserves it across filters and full spots', () => {
  render(<DemoHome features={null} onLive={() => {}} />)
  expect(screen.queryByRole('group', { name: 'Available time' })).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /^(5|15|20|30|45) min$|^1 hour$/ }),
  ).not.toBeInTheDocument()
  expect(screen.getByLabelText('Start time')).toHaveValue('13:00')
  expect(screen.getByLabelText('End time')).toHaveValue('13:15')
  fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '10:15' } })
  fireEvent.change(screen.getByLabelText('End time'), { target: { value: '12:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Find me a spot' }))
  expect(screen.getByText(/105 minutes available/)).toBeInTheDocument()
  const preferences = screen.getByRole('group', { name: 'Spot preferences' })
  for (const label of ['Indoors', 'Quiet', 'Place to sit', 'Lower light', 'Fewer people']) {
    fireEvent.click(within(preferences).getByRole('button', { name: label }))
    expect(within(preferences).getByRole('button', { name: label })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getAllByRole('article')).toHaveLength(3)
  }
  expect(within(preferences).getByRole('button', { name: 'Outdoors' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  expect(screen.getAllByRole('article')[0]).toHaveTextContent('Leavey Library')
  const leave = within(screen.getAllByRole('article')[1]).getByText(/Leave by/).textContent
  fireEvent.click(screen.getAllByRole('button', { name: 'It’s full' })[0])
  expect(screen.getAllByRole('article')).toHaveLength(2)
  expect(within(screen.getAllByRole('article')[0]).getByText(/Leave by/).textContent).toBe(leave)
  expect(screen.getByLabelText('End time')).toHaveValue('12:00')
  expect(screen.getByText(/crowd levels are simulated/)).toBeInTheDocument()
})

it('keeps valid recommendations and the last applied window when entered times are invalid', () => {
  render(<DemoHome features={null} onLive={() => {}} />)
  fireEvent.change(screen.getByLabelText('End time'), { target: { value: '12:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Find me a spot' }))
  expect(screen.getByRole('alert')).toHaveTextContent('End time must be after start time')
  expect(screen.getAllByRole('article')).toHaveLength(3)
  expect(screen.getByText(/15 minutes available/)).toBeInTheDocument()
})

it('does not let saved live filters or session exclusions empty the presentation', () => {
  localStorage.setItem(FILTERS_KEY, JSON.stringify({ ...DEFAULT_FILTERS, outlets: true }))
  sessionStorage.setItem(
    'respite-buddy-exclusions',
    JSON.stringify([{ spot_id: 'demo-way-154906721', until: '2099-01-01T00:00:00Z' }]),
  )
  render(<DemoHome features={null} onLive={() => {}} />)
  expect(screen.getAllByRole('article')).toHaveLength(3)
  expect(JSON.parse(localStorage.getItem(FILTERS_KEY)!)).toEqual({
    ...DEFAULT_FILTERS,
    outlets: true,
  })
})

it('shows both saved route legs and explains when the three engine strategies share a path', () => {
  render(<DemoHome features={null} onLive={() => {}} />)
  fireEvent.click(screen.getAllByRole('button', { name: 'Walk me there' })[0])
  expect(screen.getByRole('heading', { name: /Let’s walk to Hutton Park/ })).toBeInTheDocument()
  expect(screen.getByText('Saved walking map')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Then to class' }))
  expect(screen.getByRole('heading', { name: 'On to Tutor Campus Center.' })).toBeInTheDocument()
  expect(screen.getByText(/Leave by 1:12 PM/)).toBeInTheDocument()
  fireEvent.click(screen.getByText('Other walking routes', { selector: 'summary' }))
  expect(screen.getByRole('button', { name: /Fastest.*min/ })).toBeInTheDocument()
  expect(
    screen.getByText('Fastest, calmer, and balanced use the same path for this short walk.'),
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Back to spots' }))
  expect(screen.queryByText('Saved walking map')).not.toBeInTheDocument()
})

it('skips full spots without resetting the sample deadline and can restart after all are full', () => {
  render(<DemoHome features={null} onLive={() => {}} />)
  const second = screen.getAllByRole('article')[1]
  const leaveBy = within(second).getByText(/Leave by/).textContent
  fireEvent.click(screen.getAllByRole('button', { name: 'It’s full' })[0])
  expect(screen.getAllByRole('article')).toHaveLength(2)
  expect(within(screen.getAllByRole('article')[0]).getByText(/Leave by/).textContent).toBe(leaveBy)
  expect(screen.queryByRole('heading', { name: 'Hutton Park' })).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Your end time stays the same')
  fireEvent.click(screen.getAllByRole('button', { name: 'It’s full' })[0])
  fireEvent.click(screen.getAllByRole('button', { name: 'It’s full' })[0])
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Restart demo' }))
  expect(screen.getAllByRole('article')).toHaveLength(3)
})

it('finds a spot in one click and can promote a different option without questions', () => {
  render(<DemoHome features={null} onLive={() => {}} />)
  const first = within(screen.getAllByRole('article')[0]).getByRole('heading').textContent
  fireEvent.click(screen.getByRole('button', { name: 'Find me a spot' }))
  expect(screen.getAllByRole('article')).toHaveLength(3)
  fireEvent.click(screen.getByRole('button', { name: 'Show another pick' }))
  expect(within(screen.getAllByRole('article')[0]).getByRole('heading').textContent).not.toBe(first)
  expect(screen.getAllByRole('article')).toHaveLength(3)
})

it('keeps live tools and calendar available independently of the sample demo', async () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Use live reset tools' }))
  expect(screen.getByRole('button', { name: 'Somewhere calm, now' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Find a spot' }))
  expect(screen.getAllByRole('article')).toHaveLength(3)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'My Schedule' }))
  })
  expect(screen.getByRole('heading', { name: 'My Schedule' })).toBeInTheDocument()
})
