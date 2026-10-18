import type { CalendarEvent } from './model'
import { validateStoredSchedule } from './model'
const DB = 'respite-buddy-calendar'
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('schedule')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(
        new Error(
          'Local schedule storage is unavailable. This session still works, but changes will not survive a reload.',
        ),
      )
  })
}
export async function readSchedule(): Promise<CalendarEvent[]> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('schedule', 'readonly'),
      req = tx.objectStore('schedule').get('events')
    req.onsuccess = () => {
      try {
        resolve(req.result === undefined ? [] : validateStoredSchedule(req.result))
      } catch (error) {
        reject(error)
      }
    }
    tx.oncomplete = () => db.close()
    req.onerror = () => {
      db.close()
      reject(new Error('Unable to read local schedule.'))
    }
  })
}
export async function saveSchedule(events: CalendarEvent[]) {
  const db = await open()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('schedule', 'readwrite')
    tx.objectStore('schedule').put(events, 'events')
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(new Error('Schedule could not be saved locally.'))
    }
  })
}
export async function clearSchedule() {
  const db = await open()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('schedule', 'readwrite')
    tx.objectStore('schedule').clear()
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(new Error('Could not clear local schedule.'))
    }
  })
}
