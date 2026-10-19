import { useEffect, useRef, useState } from 'react'
import { Menu, X } from 'lucide-react'

const destinations = [
  { id: 'demo', label: 'Find a spot' },
  { id: 'schedule', label: 'My Schedule' },
  { id: 'walk', label: 'Plan a walk' },
  { id: 'directory', label: 'Campus spaces' },
  { id: 'about', label: 'Our approach' },
  { id: 'methodology', label: 'Behind the map' },
] as const

export type NavigationDestination = (typeof destinations)[number]['id']

export function HeaderNavigation({
  active,
  onNavigate,
}: {
  active: NavigationDestination
  onNavigate: (destination: NavigationDestination) => void
}) {
  const [open, setOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function outside(event: PointerEvent) {
      if (!navRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  return (
    <nav
      ref={navRef}
      className="primary-navigation"
      aria-label="Main navigation"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault()
          setOpen(false)
          toggleRef.current?.focus()
        }
      }}
    >
      <button
        ref={toggleRef}
        className="navigation-toggle"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls="primary-destinations"
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        <span className="navigation-toggle-label">Menu</span>
      </button>
      <div id="primary-destinations" className={`navigation-destinations ${open ? 'is-open' : ''}`}>
        {destinations.map(({ id, label }) => (
          <button
            key={id}
            className={`nav-item ${active === id ? 'active' : ''}`}
            aria-current={active === id ? 'page' : undefined}
            onClick={() => {
              if (open) toggleRef.current?.focus()
              setOpen(false)
              onNavigate(id)
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  )
}
