export const OFFLINE_MESSAGE = "Campus data isn't loading. Try the demo below."

/** The backend could not be reached or answered with something other than JSON. */
export class OfflineError extends Error {
  constructor() {
    super(OFFLINE_MESSAGE)
    this.name = 'OfflineError'
  }
}

// Render's free plan sleeps when idle and takes ~40 s to wake, so a timed-out first
// attempt is retried once. Every endpoint is idempotent, so retrying is safe.
const ATTEMPT_TIMEOUT_MS = 25000
const RETRIES = 1

async function attempt<T>(url: string, init: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS)
  let response: Response
  let data: unknown
  try {
    response = await fetch(url, { ...init, signal: controller.signal })
    // Proxies and sleeping hosts can answer with plain text or HTML; never parse that raw.
    data = await response.json()
  } catch {
    throw new OfflineError()
  } finally {
    clearTimeout(timeout)
  }
  if (response.ok) return data as T
  if (response.status >= 500) throw new OfflineError()
  const detail = (data as { detail?: unknown } | null)?.detail
  throw new Error(
    typeof detail === 'string' ? detail : 'Check your locations and preferences, then try again.',
  )
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
  const init: RequestInit =
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
  for (let i = 0; ; i++) {
    try {
      return await attempt<T>(`${baseUrl}/api${path}`, init)
    } catch (error) {
      if (!(error instanceof OfflineError) || i >= RETRIES) throw error
    }
  }
}
