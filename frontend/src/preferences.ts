import type { Preferences } from './types'
export const DEFAULTS: Preferences = {
  noise: 70,
  crowds: 50,
  traffic: 70,
  green: 60,
  pace: 'balanced',
  max_detour: 30,
}
export const PRESETS: Record<string, Preferences> = {
  Balanced: DEFAULTS,
  'Low noise': { ...DEFAULTS, noise: 100, traffic: 90, green: 50, pace: 'calmest' },
  'More green': { ...DEFAULTS, noise: 40, traffic: 50, green: 100, pace: 'calmest' },
  'Shortest walk': { ...DEFAULTS, noise: 0, traffic: 0, green: 0, pace: 'fastest', max_detour: 10 },
}
export function loadPreferences(): Preferences {
  try {
    const p = JSON.parse(localStorage.getItem('neuroroute-preferences') || 'null')
    if (!isPreferences(p)) return { ...DEFAULTS }
    return p
  } catch {
    return { ...DEFAULTS }
  }
}
export function distance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`
}
export function isPreferences(value: unknown): value is Preferences {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return (
    ['noise', 'crowds', 'traffic', 'green'].every(
      (key) =>
        typeof p[key] === 'number' &&
        Number.isInteger(p[key]) &&
        (p[key] as number) >= 0 &&
        (p[key] as number) <= 100,
    ) &&
    ['fastest', 'balanced', 'calmest'].includes(p.pace as string) &&
    [10, 20, 30, null].includes(p.max_detour as number | null)
  )
}
