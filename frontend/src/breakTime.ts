import { Temporal } from '@js-temporal/polyfill'
import { inZone, localInstant } from './calendar/model'

export const BREAK_INTERVALS = [15, 30, 45, 60] as const
export const breakLabel = (minutes: number) => (minutes === 60 ? '1 hour' : `${minutes} min`)

export function breakWindow(date: string, current: string, classStarts: string, nextDay = false) {
  const start = localInstant(date, current)
  const endDate = Temporal.PlainDate.from(date)
    .add({ days: nextDay ? 1 : 0 })
    .toString()
  const deadline = localInstant(endDate, classStarts)
  const minutes = Math.floor((Date.parse(deadline) - Date.parse(start)) / 60000)
  if (minutes <= 0)
    throw new Error(
      'Class must start after the selected current time. For midnight, choose next day.',
    )
  if (minutes > 240) throw new Error('Choose a break of 4 hours or less.')
  return { minutes, now: start, deadline }
}

export function timeFields(clock: string) {
  const at = inZone(clock)
  return {
    date: at.toPlainDate().toString(),
    current: at.toPlainTime().toString().slice(0, 5),
    classStarts: at.add({ minutes: 30 }).toPlainTime().toString().slice(0, 5),
    nextDay: at.add({ minutes: 30 }).day !== at.day,
  }
}
