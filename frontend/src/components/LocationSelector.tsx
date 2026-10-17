import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { Location, Point } from '../types'

export function LocationSelector({
  id,
  label,
  value,
  locations,
  onChange,
}: {
  id: string
  label: string
  value: Point | null
  locations: Location[]
  onChange: (p: Point | null) => void
}) {
  const [text, setText] = useState(value?.name ?? '')
  const editing = useRef(false)
  useEffect(() => {
    if (value) setText(value.name)
    else if (!editing.current) setText('')
    editing.current = false
  }, [value])
  return (
    <div className="location-field">
      <span className={`location-dot ${id}`} aria-hidden="true" />
      <div>
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          list={`${id}-options`}
          value={text}
          placeholder="Search campus places"
          autoComplete="off"
          onChange={(e) => {
            editing.current = true
            setText(e.target.value)
            const match = locations.find(
              (p) => p.name.toLowerCase() === e.target.value.toLowerCase(),
            )
            onChange(match ?? null)
          }}
          onBlur={() => {
            editing.current = false
            if (!value) setText('')
          }}
        />
        <datalist id={`${id}-options`}>
          {locations.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
      </div>
      {value && (
        <button
          className="icon-button"
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={() => {
            editing.current = false
            setText('')
            onChange(null)
          }}
        >
          <X size={15} />
        </button>
      )}
    </div>
  )
}
