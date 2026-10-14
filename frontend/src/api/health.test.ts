import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchHealth,
  fetchReady,
  isReady,
  parseHealthResponse,
  parseReadyResponse,
} from './health'

const BASE = 'http://backend.test'

function fakeResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as unknown as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseHealthResponse', () => {
  it('accepts the documented shape', () => {
    expect(parseHealthResponse({ status: 'healthy' })).toEqual({
      status: 'healthy',
    })
  })

  it.each([
    ['null', null],
    ['a string', 'healthy'],
    ['missing status', {}],
    ['non-string status', { status: 1 }],
  ])('rejects %s', (_label, value) => {
    expect(() => parseHealthResponse(value)).toThrowError(
      expect.objectContaining({ kind: 'parse' }),
    )
  })
})

describe('parseReadyResponse', () => {
  it('accepts the documented shape', () => {
    expect(parseReadyResponse({ status: 'ready', models_loaded: true })).toEqual(
      { status: 'ready', models_loaded: true },
    )
  })

  it('rejects a payload missing models_loaded', () => {
    expect(() => parseReadyResponse({ status: 'ready' })).toThrowError(
      expect.objectContaining({ kind: 'parse' }),
    )
  })

  it('rejects a non-boolean models_loaded', () => {
    expect(() =>
      parseReadyResponse({ status: 'ready', models_loaded: 'yes' }),
    ).toThrowError(expect.objectContaining({ kind: 'parse' }))
  })
})

describe('isReady', () => {
  it('is true only when ready and models are loaded', () => {
    expect(isReady({ status: 'ready', models_loaded: true })).toBe(true)
    expect(isReady({ status: 'ready', models_loaded: false })).toBe(false)
    expect(isReady({ status: 'not_ready', models_loaded: true })).toBe(false)
  })
})

describe('fetchHealth / fetchReady', () => {
  it('returns a validated health response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse(JSON.stringify({ status: 'healthy' }))),
    )
    await expect(fetchHealth({ baseUrl: BASE })).resolves.toEqual({
      status: 'healthy',
    })
  })

  it('returns a validated readiness response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        fakeResponse(JSON.stringify({ status: 'ready', models_loaded: true })),
      ),
    )
    await expect(fetchReady({ baseUrl: BASE })).resolves.toEqual({
      status: 'ready',
      models_loaded: true,
    })
  })

  it('rejects a health response of the wrong shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse(JSON.stringify({ ok: true }))),
    )
    await expect(fetchHealth({ baseUrl: BASE })).rejects.toMatchObject({
      kind: 'parse',
    })
  })
})
