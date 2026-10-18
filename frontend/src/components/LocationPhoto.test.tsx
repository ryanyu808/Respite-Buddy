import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { locationPhoto } from '../locationPhotos'
import { LocationPhoto, PhotoCredit } from './LocationPhoto'
import { CampusDirectory } from './CampusDirectory'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})
const leavey = { id: 'lvl-weingart', name: 'Weingart Reading Room', building_code: 'LVL' }

it('uses a real attributed building image for a room without calling it a room photo', () => {
  render(
    <>
      <LocationPhoto place={leavey} />
      <PhotoCredit place={leavey} />
    </>,
  )
  expect(screen.getByRole('img', { name: 'Leavey Library exterior' })).toHaveAttribute(
    'src',
    '/locations/leavey.jpg',
  )
  expect(screen.getByText(/not the exact room or seating area/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Photo: Bestweekevr/ })).toHaveAttribute(
    'href',
    'https://commons.wikimedia.org/wiki/File:USCLeavey2007.jpg',
  )
})

it('shares consistent demo/building photos without guessing unknown places', () => {
  expect(locationPhoto({ ...leavey, id: 'demo-lvl-weingart' })).toEqual(locationPhoto(leavey))
  expect(locationPhoto({ id: 'submitted-hoose-library-of-philosophy', name: 'Hoose' })?.src).toBe(
    '/locations/mudd.jpg',
  )
  expect(locationPhoto({ id: 'imaginary-place', name: 'Imaginary Hall' })).toBeUndefined()
  expect(
    locationPhoto({
      id: 'submitted-tutor-hall-rth-courtyard',
      name: 'Tutor Hall',
      building_code: 'RTH',
    }),
  ).toBeUndefined()
})

it('keeps authorized scout-import photos ahead of building fallbacks', () => {
  expect(locationPhoto({ ...leavey, photo_url: 'https://example.com/scouted-room.jpg' })?.src).toBe(
    'https://example.com/scouted-room.jpg',
  )
  expect(locationPhoto({ ...leavey, photo_url: 'javascript:alert(1)' })?.src).toBe(
    '/locations/leavey.jpg',
  )
})

it('replaces missing and failed images without breaking the card and recovers on another source', () => {
  const { rerender } = render(<LocationPhoto place={leavey} />)
  fireEvent.error(screen.getByRole('img'))
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.getByText('Photo coming soon')).toBeInTheDocument()
  rerender(<LocationPhoto place={{ id: 'dml-times', name: 'Times Room', building_code: 'DML' }} />)
  expect(screen.getByRole('img')).toHaveAttribute('src', '/locations/doheny.jpg')
})

it('keeps dense unknown attributes collapsed while the photo, name and walk action stay visible', () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  )
  render(<CampusDirectory onWalk={() => {}} onDemo={() => {}} />)
  fireEvent.change(screen.getByLabelText('Search campus spaces'), { target: { value: 'Weingart' } })
  const card = screen.getByRole('article')
  expect(within(card).getByRole('img')).toBeVisible()
  expect(within(card).getByRole('heading', { name: 'Weingart Reading Room' })).toBeVisible()
  expect(within(card).getByRole('button', { name: 'Walk me there' })).toBeVisible()
  expect(within(card).getByText('Outlets')).not.toBeVisible()
  fireEvent.click(within(card).getByText('More info', { selector: 'summary' }))
  expect(within(card).getByText('Outlets')).toBeVisible()
})
