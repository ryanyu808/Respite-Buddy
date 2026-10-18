import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CampusLocationPicker } from './CampusLocationPicker'
afterEach(cleanup)
function Picker() {
  const [value, setValue] = useState('')
  return <CampusLocationPicker label="Starting from" value={value} onChange={setValue} />
}
it('starts empty, shows all options on focus, and filters names and aliases', () => {
  render(<Picker />)
  const input = screen.getByRole('combobox')
  expect(input).toHaveValue('')
  fireEvent.focus(input)
  expect(screen.getAllByRole('option').length).toBeGreaterThan(8)
  fireEvent.change(input, { target: { value: 'village' } })
  expect(screen.getAllByRole('option')).toHaveLength(1)
  fireEvent.click(screen.getByRole('option', { name: 'USC Village' }))
  expect(input).toHaveValue('USC Village')
  expect(input).toHaveAttribute('aria-expanded', 'false')
})
it('supports keyboard selection and Escape without submitting the parent form', () => {
  const submit = vi.fn((e) => e.preventDefault())
  render(
    <form onSubmit={submit}>
      <Picker />
    </form>,
  )
  const input = screen.getByRole('combobox')
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: 'DML' } })
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  expect(input.getAttribute('aria-activedescendant')).toBeTruthy()
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(input).toHaveValue('Doheny Memorial Library')
  expect(submit).not.toHaveBeenCalled()
  fireEvent.focus(input)
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})
