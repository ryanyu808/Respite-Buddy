import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { DEMO_LOCATIONS } from '../services/demoJourney'

export function CampusLocationPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const listRef = useRef<HTMLUListElement>(null)
  useEffect(() => {
    if (open)
      listRef.current
        ?.querySelector<HTMLElement>('[aria-selected="true"]')
        ?.scrollIntoView?.({ block: 'nearest' })
  }, [open, active])
  const query = value.trim().toLowerCase()
  const matches = DEMO_LOCATIONS.filter((p) =>
    [p.name, ...(p.aliases ?? [])].some((name) => name.toLowerCase().includes(query)),
  )
  function choose(index: number) {
    if (!matches[index]) return
    onChange(matches[index].name)
    setOpen(false)
    setActive(-1)
  }
  return (
    <div
      className="campus-picker"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setOpen(false)
          setActive(-1)
        }
      }}
    >
      <label className="reset-field" htmlFor={id}>
        {label}
      </label>
      <div className="campus-picker-input">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={`${id}-list`}
          aria-activedescendant={
            open && active >= 0 && matches[active] ? `${id}-${active}` : undefined
          }
          value={value}
          placeholder="Search campus locations"
          autoComplete="off"
          maxLength={120}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              setOpen(true)
              setActive((current) =>
                e.key === 'ArrowDown'
                  ? Math.min(current + 1, matches.length - 1)
                  : Math.max(0, current - 1),
              )
            } else if (e.key === 'Enter' && open && active >= 0) {
              e.preventDefault()
              choose(active)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setOpen(false)
              setActive(-1)
            }
          }}
        />
        <ChevronDown size={17} aria-hidden="true" />
      </div>
      {open && (
        <ul
          ref={listRef}
          className="campus-picker-list"
          id={`${id}-list`}
          role="listbox"
          aria-label={`${label} options`}
        >
          {matches.map((p, index) => (
            <li
              key={p.id}
              id={`${id}-${index}`}
              role="option"
              aria-selected={active === index}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(index)}
            >
              {p.name}
            </li>
          ))}
          {!matches.length && (
            <li role="option" aria-selected="false" aria-disabled="true">
              No matching campus locations
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
