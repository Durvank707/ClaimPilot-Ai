import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Tests for the optional shared bearer token attached by the API client.
 *
 * `API_TOKEN` is read once from `VITE_API_TOKEN` at module load, so each case
 * stubs the environment, resets the module registry and imports the client
 * fresh. This exercises the real `requestJson`/config code rather than a mock.
 */

const BASE = 'http://backend.test'

function fakeResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as unknown as Response
}

async function loadClient(token?: string) {
  vi.resetModules()
  if (token === undefined) {
    vi.stubEnv('VITE_API_TOKEN', '')
  } else {
    vi.stubEnv('VITE_API_TOKEN', token)
  }
  return import('./client')
}

type FetchArgs = [string, { headers: Record<string, string> }]

function mockFetchOnce() {
  const fn = vi.fn(async (_url: string, _init: RequestInit) =>
    fakeResponse(JSON.stringify({ ok: true })),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('bearer token header', () => {
  it('sets Authorization when VITE_API_TOKEN is configured', async () => {
    const { requestJson } = await loadClient('shared-secret')
    const fetchMock = mockFetchOnce()

    await requestJson('/api/v1/health', { baseUrl: BASE })

    const init = (fetchMock.mock.calls as unknown as FetchArgs[])[0][1]
    expect(init.headers.Authorization).toBe('Bearer shared-secret')
  })

  it('sends no Authorization header when the token is unset', async () => {
    const { requestJson } = await loadClient()
    const fetchMock = mockFetchOnce()

    await requestJson('/api/v1/health', { baseUrl: BASE })

    const init = (fetchMock.mock.calls as unknown as FetchArgs[])[0][1]
    expect(init.headers.Authorization).toBeUndefined()
  })

  it('trims whitespace around the configured token', async () => {
    const { requestJson } = await loadClient('  trimmed-token  ')
    const fetchMock = mockFetchOnce()

    await requestJson('/api/v1/health', { baseUrl: BASE })

    const init = (fetchMock.mock.calls as unknown as FetchArgs[])[0][1]
    expect(init.headers.Authorization).toBe('Bearer trimmed-token')
  })

  it('lets a per-call header override the bearer token', async () => {
    const { requestJson } = await loadClient('shared-secret')
    const fetchMock = mockFetchOnce()

    await requestJson('/api/v1/health', {
      baseUrl: BASE,
      headers: { Authorization: 'Bearer override' },
    })

    const init = (fetchMock.mock.calls as unknown as FetchArgs[])[0][1]
    expect(init.headers.Authorization).toBe('Bearer override')
  })
})
