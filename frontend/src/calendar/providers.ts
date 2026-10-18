import { Temporal } from '@js-temporal/polyfill'
import { ZONE, localInstant, mergeEvents, type CalendarEvent } from './model'
const CLIENT = import.meta.env.VITE_MICROSOFT_CLIENT_ID || ''
const TENANT = import.meta.env.VITE_MICROSOFT_TENANT_ID || 'common'
const SCOPES = 'https://graph.microsoft.com/Calendars.ReadBasic'
export const microsoftConfigured = Boolean(CLIENT && /^[a-zA-Z0-9.-]+$/.test(TENANT))
const base64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
const random = () => base64(crypto.getRandomValues(new Uint8Array(32)))
type Connection = { token: string; expires: number }
// Access tokens and PKCE verifier live in memory only, not URLs or browser storage.
let connection: Connection | null = null
let connectionVersion = 0
let cancelPending: (() => void) | null = null
export const disconnectMicrosoft = () => {
  connection = null
  connectionVersion++
  cancelPending?.()
}
export async function connectMicrosoft(): Promise<void> {
  if (!microsoftConfigured)
    throw new Error('Microsoft app registration is not configured. Use local ICS import instead.')
  disconnectMicrosoft()
  const version = connectionVersion
  const verifier = random(),
    state = random(),
    redirect = `${location.origin}/oauth-callback.html`
  const challenge = base64(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
  )
  const popup = window.open('about:blank', 'respite-calendar', 'popup,width=520,height=700')
  if (!popup) throw new Error('Allow the calendar sign-in popup, or use ICS import.')
  const code = await new Promise<string>((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener('message', receive)
      clearTimeout(timeout)
      clearInterval(closed)
      popup.close()
      cancelPending = null
    }
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== popup ||
        event.data?.type !== 'respite-calendar-code'
      )
        return
      if (event.data.state !== state) {
        cleanup()
        reject(new Error('Calendar sign-in state did not match. Try again.'))
        return
      }
      if (event.data.error || !event.data.code) {
        cleanup()
        reject(new Error('Calendar permission was not granted.'))
        return
      }
      cleanup()
      resolve(event.data.code)
    }
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Calendar sign-in expired. Try again.'))
    }, 180000)
    const closed = setInterval(() => {
      if (popup.closed) {
        cleanup()
        reject(new Error('Calendar sign-in was closed.'))
      }
    }, 500)
    window.addEventListener('message', receive)
    cancelPending = () => {
      cleanup()
      reject(new Error('Calendar connection cancelled.'))
    }
    const params = new URLSearchParams({
      client_id: CLIENT,
      response_type: 'code',
      redirect_uri: redirect,
      response_mode: 'query',
      scope: SCOPES,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'consent',
    })
    popup.location.href = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?${params}`
  })
  const response = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirect,
      code_verifier: verifier,
      scope: SCOPES,
    }),
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok)
    throw new Error(
      'Microsoft could not complete sign-in. Check the SPA registration and redirect URI.',
    )
  const token = await response.json()
  if (version !== connectionVersion) throw new Error('Calendar connection was disconnected.')
  if (typeof token.access_token !== 'string')
    throw new Error('Microsoft did not return an access token.')
  connection = {
    token: token.access_token,
    expires: Date.now() + Math.min(Number(token.expires_in) || 3600, 3600) * 1000,
  }
}
async function graph(path: string) {
  const version = connectionVersion
  if (!connection || connection.expires <= Date.now()) {
    connection = null
    throw new Error('Connect Microsoft Calendar again; the temporary session expired.')
  }
  if (!path.startsWith('https://graph.microsoft.com/v1.0/'))
    throw new Error('Unexpected calendar pagination URL.')
  const response = await fetch(path, {
    redirect: 'error',
    headers: { Authorization: `Bearer ${connection.token}` },
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok)
    throw new Error('Microsoft calendar request failed. Reconnect or import an ICS export.')
  const data = await response.json()
  if (version !== connectionVersion) throw new Error('Microsoft disconnected; import cancelled.')
  return data
}
export async function microsoftCalendars(): Promise<{ id: string; name: string }[]> {
  const data = await graph('https://graph.microsoft.com/v1.0/me/calendars?$select=id,name&$top=50')
  return data.value.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))
}
export async function importMicrosoft(
  calendar: string,
  from: string,
  through: string,
): Promise<CalendarEvent[]> {
  const first = Temporal.PlainDate.from(from),
    last = Temporal.PlainDate.from(through)
  if (first.until(last).days < 0 || first.until(last).days > 120)
    throw new Error('Select a date range of at most 120 days.')
  const params = new URLSearchParams({
    startDateTime: localInstant(from, '00:00'),
    endDateTime: localInstant(last.add({ days: 1 }).toString(), '00:00'),
    $top: '100',
    $select: 'id,subject,start,end,location,isAllDay,isCancelled',
  })
  let url = `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendar)}/calendarView?${params}`
  const events: CalendarEvent[] = []
  for (let page = 0; url && page < 4; page++) {
    const data = await graph(url)
    for (const raw of data.value) {
      if (raw.isCancelled) continue
      const convert = (time: { dateTime: string; timeZone: string }) => {
        if (time.timeZone === 'UTC')
          return new Date(`${time.dateTime.replace(/Z$/, '')}Z`).toISOString()
        const zone = time.timeZone === 'Pacific Standard Time' ? ZONE : time.timeZone
        const [date, clock] = time.dateTime.split('T')
        return localInstant(date, clock, zone)
      }
      const start = convert(raw.start),
        end = convert(raw.end)
      if (Date.parse(end) <= Date.parse(start)) continue
      events.push({
        id: `microsoft:${raw.id}`.slice(0, 200),
        source: 'microsoft',
        sourceEventId: raw.id,
        title: raw.subject?.slice(0, 300) || 'Untitled event',
        start,
        end,
        timeZone: ZONE,
        location: raw.location?.displayName?.slice(0, 160) || '',
        buildingCode: '',
        room: '',
        section: '',
        notes: 'Imported on demand from Microsoft; review before saving.',
        category: 'unclassified',
        allDay: Boolean(raw.isAllDay),
        recurrence: null,
      })
    }
    url = data['@odata.nextLink'] || ''
  }
  if (url)
    throw new Error(
      'More than 400 events match this calendar. Choose a shorter date range; nothing was saved.',
    )
  return mergeEvents([], events)
}
