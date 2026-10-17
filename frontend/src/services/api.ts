export async function api<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25000)
  try {
    const response = await fetch(`/api${path}`, {
      signal: controller.signal,
      ...(body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    })
    const data = await response.json()
    if (!response.ok) {
      const message =
        typeof data.detail === 'string'
          ? data.detail
          : 'Check your locations and preferences, then try again.'
      throw new Error(message)
    }
    return data as T
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      throw new Error('This request took too long. Please try again.')
    if (error instanceof TypeError)
      throw new Error('Unable to reach NeuroRoute. Check that the backend is running on port 8000.')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
