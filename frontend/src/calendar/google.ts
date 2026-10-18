/** Google Identity Services browser token model: no client secret or refresh token.
 * GIS owns the popup transport; this flow does not expose an authorization code,
 * so PKCE code exchange is not applicable. State is additionally checked here.
 */
import { Temporal } from '@js-temporal/polyfill'
import { ZONE, localInstant, mergeEvents, type CalendarEvent } from './model'
const CLIENT = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly'
export const googleConfigured = Boolean(CLIENT)
type TokenResponse = {
  access_token?: string
  expires_in?: number
  state?: string
  error?: string
  scope?: string
}
type GoogleOAuth = {
  initTokenClient: (config: {
    client_id: string
    scope: string
    include_granted_scopes: boolean
    state: string
    prompt: string
    callback: (response: TokenResponse) => void
    error_callback: () => void
  }) => { requestAccessToken: () => void }
  revoke: (token: string, callback: () => void) => void
}
declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleOAuth } }
  }
}
let token: { value: string; until: number } | null = null,
  version = 0,
  pending: (() => void) | null = null
export function disconnectGoogle() {
  version++
  pending?.()
  token = null
}
function loadSDK(): Promise<GoogleOAuth> {
  if (window.google?.accounts.oauth2) return Promise.resolve(window.google.accounts.oauth2)
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.referrerPolicy = 'no-referrer'
    const timeout = setTimeout(() => {
      script.remove()
      reject(new Error('Google sign-in could not load. Use ICS import or try again.'))
    }, 15000)
    script.onload = () => {
      clearTimeout(timeout)
      if (window.google?.accounts.oauth2) resolve(window.google.accounts.oauth2)
      else reject(new Error('Google sign-in is unavailable.'))
    }
    script.onerror = () => {
      clearTimeout(timeout)
      script.remove()
      reject(new Error('Google sign-in was blocked. Use ICS import.'))
    }
    document.head.appendChild(script)
  })
}
export async function connectGoogle() {
  if (!googleConfigured)
    throw new Error('Google OAuth client is not configured. Use local ICS import instead.')
  disconnectGoogle()
  const current = version,
    sdk = await loadSDK()
  if (current !== version) throw new Error('Google connection cancelled.')
  const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout)
      pending = null
    }
    const timeout = setTimeout(() => {
      cleanup()
      version++
      reject(new Error('Google consent expired. Connect again.'))
    }, 180000)
    pending = () => {
      cleanup()
      reject(new Error('Google connection cancelled.'))
    }
    const client = sdk.initTokenClient({
      client_id: CLIENT,
      scope: SCOPE,
      include_granted_scopes: false,
      state,
      prompt: 'consent',
      callback: (response) => {
        cleanup()
        if (
          current !== version ||
          response.state !== state ||
          response.error ||
          !response.access_token ||
          !response.scope?.split(' ').includes(SCOPE)
        ) {
          reject(new Error('Google consent could not be validated. No calendar was imported.'))
          return
        }
        token = {
          value: response.access_token,
          until: Date.now() + Math.min(Number(response.expires_in) || 3600, 3600) * 1000,
        }
        resolve()
      },
      error_callback: () => {
        cleanup()
        reject(
          new Error('Google sign-in popup was closed or blocked. Use ICS import or try again.'),
        )
      },
    })
    client.requestAccessToken()
  })
}
export async function revokeGoogle() {
  const value = token?.value,
    sdk = window.google?.accounts.oauth2
  disconnectGoogle()
  if (value && sdk)
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 5000)
      sdk.revoke(value, () => {
        clearTimeout(timeout)
        resolve()
      })
    })
}
export async function importGoogle(from: string, through: string): Promise<CalendarEvent[]> {
  if (!token || token.until <= Date.now()) {
    disconnectGoogle()
    throw new Error('Connect Google Calendar again; the temporary session expired.')
  }
  const session = token,
    current = version,
    first = Temporal.PlainDate.from(from),
    last = Temporal.PlainDate.from(through)
  if (first.until(last).days < 0 || first.until(last).days > 120)
    throw new Error('Choose an import range of at most 120 days.')
  const params = new URLSearchParams({
    timeMin: localInstant(from, '00:00'),
    timeMax: localInstant(last.add({ days: 1 }).toString(), '00:00'),
    singleEvents: 'true',
    maxResults: '100',
    orderBy: 'startTime',
    fields: 'items(id,status,summary,start,end,location),nextPageToken',
  })
  const events: CalendarEvent[] = []
  let next = ''
  for (let page = 0; page < 4; page++) {
    if (next) params.set('pageToken', next)
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      {
        headers: { Authorization: `Bearer ${session.value}` },
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      },
    )
    if (!response.ok)
      throw new Error('Google calendar request failed. Reconnect or use ICS import.')
    const data = await response.json()
    if (current !== version) throw new Error('Google disconnected; import cancelled.')
    for (const raw of data.items ?? []) {
      if (raw.status === 'cancelled') continue
      const allDay = Boolean(raw.start?.date),
        start = allDay
          ? localInstant(raw.start.date, '00:00')
          : Temporal.Instant.from(raw.start.dateTime).toString(),
        end = allDay
          ? localInstant(raw.end.date, '00:00')
          : Temporal.Instant.from(raw.end.dateTime).toString()
      if (Date.parse(end) <= Date.parse(start)) continue
      events.push({
        id: `google:${raw.id}`.slice(0, 200),
        source: 'google',
        sourceEventId: raw.id,
        title: raw.summary?.slice(0, 300) || 'Untitled event',
        start,
        end,
        timeZone: ZONE,
        location: raw.location?.slice(0, 160) || '',
        buildingCode: '',
        room: '',
        section: '',
        notes: 'Imported on demand from Google primary calendar; review before saving.',
        category: 'unclassified',
        allDay,
        recurrence: null,
      })
    }
    next = data.nextPageToken ?? ''
    if (!next) return mergeEvents([], events)
  }
  throw new Error(
    'More than 400 events match this calendar. Use a shorter date range; nothing was saved.',
  )
}
