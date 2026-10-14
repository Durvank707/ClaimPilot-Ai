import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestJson } from './client'
import { ApiError } from './errors'

const BASE = 'http://backend.test'

/** Minimal stand-in for a fetch Response — only the fields the client reads. */
function fakeResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as unknown as Response
}

function mockFetch(impl: (...args: unknown[]) => unknown) {
  const fn = vi.fn(impl as never)
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestJson', () => {
  it('returns parsed JSON for a successful response', async () => {
    const fetchMock = mockFetch(async () =>
      fakeResponse(JSON.stringify({ status: 'healthy' })),
    )

    const data = await requestJson('/api/v1/health', { baseUrl: BASE })

    expect(data).toEqual({ status: 'healthy' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/health`)
  })

  it('returns null for an empty body', async () => {
    mockFetch(async () => fakeResponse(''))
    expect(await requestJson('/empty', { baseUrl: BASE })).toBeNull()
  })

  it('raises an http error for a non-2xx response (non-JSON body)', async () => {
    mockFetch(async () => fakeResponse('<html>Server Error</html>', 500))

    await expect(requestJson('/boom', { baseUrl: BASE })).rejects.toMatchObject({
      kind: 'http',
      status: 500,
    })
  })

  it('raises a network error when fetch rejects', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    const error = await requestJson('/offline', { baseUrl: BASE }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).kind).toBe('network')
  })

  it('raises a timeout error when the backend does not respond in time', async () => {
    mockFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as { signal?: AbortSignal } | undefined)?.signal
          signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          )
        }),
    )

    await expect(
      requestJson('/slow', { baseUrl: BASE, timeoutMs: 20 }),
    ).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('raises an aborted error when the caller cancels the request', async () => {
    mockFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as { signal?: AbortSignal } | undefined)?.signal
          signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          )
        }),
    )

    const controller = new AbortController()
    const pending = requestJson('/slow', {
      baseUrl: BASE,
      signal: controller.signal,
      timeoutMs: 1000,
    })
    controller.abort()

    await expect(pending).rejects.toMatchObject({ kind: 'aborted' })
  })

  it('raises a parse error for an invalid JSON body', async () => {
    mockFetch(async () => fakeResponse('not really json {'))

    await expect(requestJson('/bad', { baseUrl: BASE })).rejects.toMatchObject({
      kind: 'parse',
    })
  })
})
