import { afterEach, describe, it, expect, vi } from 'vitest'
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete window.google
  vi.resetModules()
})
describe('read-only provider security adapters (mocked, not live consent)', () => {
  async function google(wrongState = false) {
    vi.resetModules()
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-public-client.apps.googleusercontent.com')
    const init = vi.fn(
      (
        config: Parameters<
          NonNullable<Window['google']>['accounts']['oauth2']['initTokenClient']
        >[0],
      ) => ({
        requestAccessToken: () =>
          config.callback({
            access_token: 'mock-only-token',
            state: wrongState ? 'wrong' : config.state,
            expires_in: 3600,
            scope: config.scope,
          }),
      }),
    )
    window.google = {
      accounts: { oauth2: { initTokenClient: init, revoke: vi.fn((_t, done) => done()) } },
    }
    const provider = await import('./google')
    return { provider, init }
  }
  it('checks Google state and narrow scope before accepting tokens', async () => {
    const { provider, init } = await google(true)
    await expect(provider.connectGoogle()).rejects.toThrow(/validated/)
    expect(init.mock.calls[0][0].scope).toBe(
      'https://www.googleapis.com/auth/calendar.events.readonly',
    )
    await expect(provider.importGoogle('2026-10-19', '2026-10-20')).rejects.toThrow(
      /Connect Google/,
    )
  })
  it('normalizes Google occurrences without auto-classifying or storing tokens', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem'),
      fetch = vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            items: [
              {
                id: 'event',
                summary: 'Class',
                location: 'LVL',
                start: { dateTime: '2026-10-19T09:00:00-07:00' },
                end: { dateTime: '2026-10-19T10:00:00-07:00' },
              },
            ],
          }),
        })
    vi.stubGlobal('fetch', fetch)
    const { provider } = await google()
    await provider.connectGoogle()
    const events = await provider.importGoogle('2026-10-19', '2026-10-20')
    expect(events[0]).toMatchObject({
      source: 'google',
      category: 'unclassified',
      start: '2026-10-19T16:00:00Z',
    })
    expect(fetch.mock.calls[0][0]).not.toContain('mock-only-token')
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer mock-only-token')
    expect(storage).not.toHaveBeenCalled()
    provider.disconnectGoogle()
    await expect(provider.importGoogle('2026-10-19', '2026-10-20')).rejects.toThrow(
      /Connect Google/,
    )
  })
  it('bounds Google pagination and cancels an in-flight import on disconnect', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ items: [], nextPageToken: 'more' }) })
    vi.stubGlobal('fetch', fetch)
    const { provider } = await google()
    await provider.connectGoogle()
    await expect(provider.importGoogle('2026-10-19', '2026-10-20')).rejects.toThrow(/400/)
    expect(fetch).toHaveBeenCalledTimes(4)
    fetch.mockImplementationOnce(async () => {
      provider.disconnectGoogle()
      return { ok: true, json: async () => ({ items: [] }) }
    })
    await expect(provider.importGoogle('2026-10-19', '2026-10-20')).rejects.toThrow(/disconnected/)
  })
  it('Google cancellation does not install a late token', async () => {
    const { provider } = await google()
    const promise = provider.connectGoogle()
    provider.disconnectGoogle()
    await expect(promise).rejects.toThrow(/cancelled/)
  })
  async function microsoft() {
    vi.resetModules()
    vi.stubEnv('VITE_MICROSOFT_CLIENT_ID', 'mock-public-spa-client')
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array) => {
        array.fill(12)
        return array
      },
      subtle: { digest: async () => new Uint8Array(32).buffer },
    })
    const popup = { closed: false, close: vi.fn(), location: { href: '' } }
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
    const provider = await import('./providers')
    return { provider, popup }
  }
  function deliver(popup: unknown, state: string) {
    const event = new MessageEvent('message', {
      origin: location.origin,
      data: { type: 'respite-calendar-code', state, code: 'mock-one-time-code' },
    })
    Object.defineProperty(event, 'source', { value: popup })
    window.dispatchEvent(event)
  }
  it('Microsoft uses state, PKCE S256, POST exchange and memory-only tokens', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'mock-token', expires_in: 3600 }),
      })
    vi.stubGlobal('fetch', fetch)
    const { provider, popup } = await microsoft(),
      promise = provider.connectMicrosoft()
    await new Promise((r) => setTimeout(r, 0))
    const url = new URL(popup.location.href)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('scope')).not.toContain('Write')
    expect(url.searchParams.get('scope')).not.toContain('offline_access')
    deliver(popup, url.searchParams.get('state')!)
    await promise
    expect(fetch.mock.calls[0][1].method).toBe('POST')
    expect(fetch.mock.calls[0][1].body.get('code_verifier')).toBeTruthy()
    expect(fetch.mock.calls[0][0]).not.toContain('mock-token')
    provider.disconnectMicrosoft()
    await expect(provider.microsoftCalendars()).rejects.toThrow(/Connect Microsoft/)
  })
  it('Microsoft rejects a mismatched state without exchanging the code', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { provider, popup } = await microsoft(),
      promise = provider.connectMicrosoft()
    await new Promise((r) => setTimeout(r, 0))
    deliver(popup, 'wrong')
    await expect(promise).rejects.toThrow(/state/)
    expect(fetch).not.toHaveBeenCalled()
  })
})
