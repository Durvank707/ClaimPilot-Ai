import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  describeSubmitError,
  parseClaimAnalysisResponse,
  submitClaim,
  SUBMIT_TIMEOUT_MS,
  type ClaimRequest,
} from './claims'
import { ApiError } from './errors'

const BASE = 'http://backend.test'

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

function validPayload(): Record<string, unknown> {
  return {
    claim_id: 'POLICY-42',
    fraud: { probability: 0.12 },
    severity: { predicted_claim_amount: 12000 },
    anomaly: { score: 0.31 },
    risk: { score: 55, level: 'HIGH' },
    explanation: { summary: 'example' },
    decision: { recommendation: 'review' },
  }
}

const REQUEST: ClaimRequest = {
  policy_id: 'POLICY-42',
  incident_date: '2024-05-01',
  claim_amount: 18500,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('submitClaim', () => {
  it('POSTs the claim as JSON to the analyze endpoint', async () => {
    const fetchMock = mockFetch(async () =>
      fakeResponse(JSON.stringify(validPayload())),
    )

    const result = await submitClaim(REQUEST, { baseUrl: BASE })

    expect(result.claim_id).toBe('POLICY-42')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/v1/claims/analyze`)
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify(REQUEST))
    const headers = init.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('uses a longer default timeout than a health probe', () => {
    expect(SUBMIT_TIMEOUT_MS).toBeGreaterThan(8000)
  })

  it('rejects with a parse error for an unexpected response shape', async () => {
    mockFetch(async () => fakeResponse(JSON.stringify({ foo: 'bar' })))
    await expect(submitClaim(REQUEST, { baseUrl: BASE })).rejects.toMatchObject({
      kind: 'parse',
    })
  })

  it('rejects with a parse error when a required section is missing', async () => {
    const payload = validPayload()
    delete (payload as Record<string, unknown>).risk
    mockFetch(async () => fakeResponse(JSON.stringify(payload)))
    await expect(submitClaim(REQUEST, { baseUrl: BASE })).rejects.toMatchObject({
      kind: 'parse',
    })
  })

  it('propagates the parsed body of an HTTP error', async () => {
    const detail = {
      detail: [
        {
          loc: ['body', 'claim_amount'],
          msg: 'Input should be a valid number',
          type: 'float_parsing',
        },
      ],
    }
    mockFetch(async () => fakeResponse(JSON.stringify(detail), 422))

    const error = await submitClaim(REQUEST, { baseUrl: BASE }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).kind).toBe('http')
    expect((error as ApiError).status).toBe(422)
    expect((error as ApiError).details).toEqual(detail)
  })

  it('rejects with a network error when fetch fails', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(submitClaim(REQUEST, { baseUrl: BASE })).rejects.toMatchObject({
      kind: 'network',
    })
  })

  it('rejects with a timeout error when the backend does not respond', async () => {
    mockFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as { signal?: AbortSignal } | undefined)?.signal
          signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    await expect(
      submitClaim(REQUEST, { baseUrl: BASE, timeoutMs: 20 }),
    ).rejects.toMatchObject({ kind: 'timeout' })
  })
})

describe('parseClaimAnalysisResponse', () => {
  it('keeps a null claim_id when the backend omits it', () => {
    const parsed = parseClaimAnalysisResponse({
      ...validPayload(),
      claim_id: null,
    })
    expect(parsed.claim_id).toBeNull()
  })

  it('never invents an analysis_id (the API does not return one)', () => {
    const parsed = parseClaimAnalysisResponse(validPayload())
    expect('analysis_id' in parsed).toBe(false)
  })
})

describe('describeSubmitError', () => {
  it('maps FastAPI validation errors onto their fields', () => {
    const error = new ApiError('http', 'failed', {
      status: 422,
      details: {
        detail: [
          { loc: ['body', 'claim_amount'], msg: 'Input should be a number' },
        ],
      },
    })

    const info = describeSubmitError(error)
    expect(info.fieldErrors).toEqual({
      claim_amount: 'Input should be a number',
    })
    expect(info.message).toMatch(/rejected some of the submitted claim data/i)
    expect(info.uncertain).toBe(false)
  })

  it('ignores validation entries for unknown fields', () => {
    const error = new ApiError('http', 'failed', {
      status: 422,
      details: {
        detail: [{ loc: ['body', 'internal_secret_field'], msg: 'nope' }],
      },
    })
    expect(describeSubmitError(error).fieldErrors).toEqual({})
  })

  it('reports HTTP failures generically', () => {
    const info = describeSubmitError(new ApiError('http', 'x', { status: 500 }))
    expect(info.message).toBe('The backend returned an error (HTTP 500).')
    expect(info.uncertain).toBe(false)
  })

  it('flags timeouts and network errors as uncertain', () => {
    expect(describeSubmitError(new ApiError('timeout', 'x')).uncertain).toBe(true)
    expect(describeSubmitError(new ApiError('network', 'x')).uncertain).toBe(true)
    expect(describeSubmitError(new ApiError('network', 'x')).message).toBe(
      'Could not reach the backend service.',
    )
  })

  it('reports parse failures as an unexpected response', () => {
    const info = describeSubmitError(new ApiError('parse', 'x'))
    expect(info.message).toBe('The backend returned an unexpected response.')
  })

  it('handles non-ApiError values without leaking detail', () => {
    const info = describeSubmitError(new Error('boom: secret stack'))
    expect(info.message).not.toMatch(/boom|secret/)
  })
})
