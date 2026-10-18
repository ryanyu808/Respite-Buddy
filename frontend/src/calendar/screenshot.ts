import type { ImportPreview } from './ics'
import { manualEvent, type CalendarEvent } from './model'

export function validateScreenshot(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('Use a PNG, JPEG or WebP screenshot.')
  if (file.size > 5 * 1024 * 1024) throw new Error('Screenshot must be 5 MB or smaller.')
}
/** Conservative row format only: title | Mon,Wed | 09:00-10:15 | LVL | 201.
 * Grid-style screenshots remain raw OCR for manual correction, never guessed.
 */
export function parseScheduleText(text: string, date: string): ImportPreview {
  const events: CalendarEvent[] = [],
    warnings: string[] = []
  for (const row of text.split('\n').filter((v) => v.trim())) {
    const [title, days, time, location, room] = row.split('|').map((v) => v.trim())
    const times = time?.match(/^(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})$/)
    const dayNames = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    const dayParts = days?.split(/[, ]+/).filter(Boolean) ?? []
    const dayNumbers = dayParts.map((d) => dayNames.indexOf(d.toLowerCase()) + 1)
    if (!title || !location || !times || !dayNumbers.length || dayNumbers.includes(0)) {
      warnings.push(
        'Some OCR rows need manual correction. Use Title | Mon,Wed | 09:00-10:15 | Building | Room.',
      )
      continue
    }
    try {
      const event = manualEvent({
        title,
        section: '',
        date,
        until: '',
        days: dayNumbers,
        start: times[1],
        end: times[2],
        location,
        buildingCode: '',
        room: room || '',
        notes: 'Extracted from screenshot; review every field.',
        category: 'unclassified',
      })
      events.push({ ...event, source: 'screenshot' })
    } catch {
      warnings.push('An OCR row had invalid or missing times. Please enter it manually.')
    }
  }
  return { events, warnings: [...new Set(warnings)] }
}
export async function recognizeScreenshot(file: File, onProgress: (progress: number) => void) {
  validateScreenshot(file)
  const bitmap = await createImageBitmap(file)
  const tooLarge = bitmap.width * bitmap.height > 16_000_000
  bitmap.close()
  if (tooLarge) throw new Error('Image exceeds 16 megapixels. Crop the schedule and try again.')
  // Lazy, browser-local OCR. Worker/model downloads may need an internet connection;
  // the image itself is never sent to an API.
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress(m.progress)
    },
  })
  try {
    return (await worker.recognize(file)).data.text
  } finally {
    await worker.terminate()
  }
}
