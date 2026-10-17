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
    if (
      !p ||
      !['noise', 'crowds', 'traffic', 'green'].every(
        (k) => Number.isInteger(p[k]) && p[k] >= 0 && p[k] <= 100,
      ) ||
      !['fastest', 'balanced', 'calmest'].includes(p.pace) ||
      ![10, 20, 30, null].includes(p.max_detour)
    )
      return { ...DEFAULTS }
    return p
  } catch {
    return { ...DEFAULTS }
  }
}
export function distance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`
}
