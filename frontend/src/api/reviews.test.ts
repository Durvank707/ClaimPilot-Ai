import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createReview,
  describeReviewError,
  getAnalysisReviews,
  parseReview,
  parseReviewList,
  REVIEW_OUTCOMES,
  type Review,
  type ReviewRequest,
} from './reviews'
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

function reviewPayload(overrides: Partial<Review> = {}): Record<string, unknown> {
  return {
    review_id: 'REV-1',
    final_decision: 'APPROVED',
    reviewer_id: 'OFFICER-7',
    comments: 'Documents verified.',
    reviewed_at: '2024-05-02T09:30:00',
    analysis_id: 'AN-1',
    claim_id: 'CLM-1',
    ...overrides,
  }
}

const REQUEST: ReviewRequest = { final_decision: 'APPROVED' }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('REVIEW_OUTCOMES', () => {
  it('exposes exactly the four allowed human outcomes', () => {
    expect(REVIEW_OUTCOMES).toEqual([
      'APPROVED',
      'REJECTED',
      'NEEDS_MORE_INFO',
      'ESCALATED',
    ])
  })
})

describe('createReview', () => {
  it('POSTs the review as JSON to the analysis reviews endpoint', async () => {
    const fetchMock = mockFetch(async () =>
      fakeResponse(JSON.stringify(reviewPayload())),
    )

    const result = await createReview('AN-1', REQUEST, { baseUrl: BASE })

    expect(result.review_id).toBe('REV-1')
    expect(result.final_decision).toBe('APPROVED')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/v1/analyses/AN-1/reviews`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      final_decision: 'APPROVED',
    })
    const headers = init.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('URL-encodes the analysis id in the path', async () => {
    const fetchMock = mockFetch(async () =>
      fakeResponse(JSON.stringify(reviewPayload())),
    )

    await createReview('AN 1/2', REQUEST, { baseUrl: BASE })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/v1/analyses/AN%201%2F2/reviews`)
  })

  it('trims reviewer id and notes and omits blank values', async () => {
    const fetchMock = mockFetch(async () =>
      fakeResponse(JSON.stringify(reviewPayload())),
    )

    await createReview(
      'AN-1',
      { final_decision: 'REJECTED', reviewer_id: '  ', comments: '  ' },
      { baseUrl: BASE },
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      final_decision: 'REJECTED',
    })
  })

  it('keeps provided reviewer id and notes (trimmed)', async () => {
    const fetchMock = mockFetch(async () =>
      fakeResponse(JSON.stringify(reviewPayload())),
    )

    await createReview(
      'AN-1',
      {
        final_decision: 'ESCALATED',
        reviewer_id: '  OFFICER-9 ',
        comments: '  Needs more evidence. ',
      },
      { baseUrl: BASE },
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      final_decision: 'ESCALATED',
      reviewer_id: 'OFFICER-9',
      comments: 'Needs more evidence.',
    })
  })

  it('rejects with a parse error for an unexpected response shape', async () => {
    mockFetch(async () => fakeResponse(JSON.stringify({ foo: 'bar' })))
    await expect(
      createReview('AN-1', REQUEST, { baseUrl: BASE }),
    ).rejects.toMatchObject({ kind: 'parse' })
  })

  it('propagates the parsed body of an HTTP error', async () => {
    const detail = {
      detail: [
        {
          loc: ['body', 'final_decision'],
          msg: 'Value error, final_decision must be one of: APPROVED, REJECTED',
          type: 'value_error',
        },
      ],
    }
    mockFetch(async () => fakeResponse(JSON.stringify(detail), 422))

    const error = await createReview('AN-1', REQUEST, { baseUrl: BASE }).catch(
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
    await expect(
      createReview('AN-1', REQUEST, { baseUrl: BASE }),
    ).rejects.toMatchObject({ kind: 'network' })
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
      createReview('AN-1', REQUEST, { baseUrl: BASE, timeoutMs: 20 }),
    ).rejects.toMatchObject({ kind: 'timeout' })
  })
})

describe('getAnalysisReviews', () => {
  it('GETs the reviews list for the analysis', async () => {
    const fetchMock = mockFetch(async () =>
      fakeResponse(
        JSON.stringify([
          reviewPayload({ review_id: 'REV-2', final_decision: 'ESCALATED' }),
          reviewPayload(),
        ]),
      ),
    )

    const reviews = await getAnalysisReviews('AN-1', { baseUrl: BASE })

    expect(reviews.map((r) => r.review_id)).toEqual(['REV-2', 'REV-1'])

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/v1/analyses/AN-1/reviews`)
    expect(init.method).toBe('GET')
  })

  it('rejects a non-list response with a parse error', async () => {
    mockFetch(async () => fakeResponse(JSON.stringify({ items: [] })))
    await expect(
      getAnalysisReviews('AN-1', { baseUrl: BASE }),
    ).rejects.toMatchObject({ kind: 'parse' })
  })

  it('propagates a 404 rather than returning an empty list', async () => {
    mockFetch(async () =>
      fakeResponse(JSON.stringify({ detail: 'Analysis not found' }), 404),
    )
    const error = await getAnalysisReviews('AN-1', { baseUrl: BASE }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
  })
})

describe('parseReview', () => {
  it('preserves strings and null fields', () => {
    const parsed = parseReview(
      reviewPayload({ reviewer_id: null, comments: null, claim_id: null }),
    )
    expect(parsed.reviewer_id).toBeNull()
    expect(parsed.comments).toBeNull()
    expect(parsed.claim_id).toBeNull()
    expect(parsed.analysis_id).toBe('AN-1')
  })

  it('rejects a non-object payload', () => {
    expect(() => parseReview([])).toThrow(ApiError)
    expect(() => parseReview('nope')).toThrow(ApiError)
  })

  it('rejects a field with the wrong type', () => {
    expect(() => parseReview({ ...reviewPayload(), review_id: 42 })).toThrow(
      ApiError,
    )
  })

  it('rejects a payload without a review_id', () => {
    expect(() => parseReview({ final_decision: 'APPROVED' })).toThrow(ApiError)
  })
})

describe('parseReviewList', () => {
  it('parses every item', () => {
    const list = parseReviewList([reviewPayload(), reviewPayload()])
    expect(list).toHaveLength(2)
  })

  it('rejects a non-list payload', () => {
    expect(() => parseReviewList({})).toThrow(ApiError)
  })
})

describe('describeReviewError', () => {
  it('maps FastAPI validation errors onto their fields', () => {
    const error = new ApiError('http', 'failed', {
      status: 422,
      details: {
        detail: [
          {
            loc: ['body', 'final_decision'],
            msg: 'final_decision must be one of: APPROVED, REJECTED',
          },
        ],
      },
    })

    const info = describeReviewError(error)
    expect(info.fieldErrors).toEqual({
      final_decision: 'final_decision must be one of: APPROVED, REJECTED',
    })
    expect(info.message).toMatch(/rejected some of the review data/i)
    expect(info.uncertain).toBe(false)
    expect(info.notFound).toBe(false)
  })

  it('ignores validation entries for unknown fields', () => {
    const error = new ApiError('http', 'failed', {
      status: 422,
      details: {
        detail: [{ loc: ['body', 'internal_secret_field'], msg: 'nope' }],
      },
    })
    expect(describeReviewError(error).fieldErrors).toEqual({})
  })

  it('reports a missing analysis as notFound with a clear message', () => {
    const info = describeReviewError(
      new ApiError('http', 'x', { status: 404 }),
    )
    expect(info.notFound).toBe(true)
    expect(info.message).toMatch(/no longer available/i)
  })

  it('reports HTTP failures generically', () => {
    const info = describeReviewError(new ApiError('http', 'x', { status: 500 }))
    expect(info.message).toBe('The backend returned an error (HTTP 500).')
    expect(info.notFound).toBe(false)
  })

  it('flags timeouts and network errors as uncertain', () => {
    expect(describeReviewError(new ApiError('timeout', 'x')).uncertain).toBe(true)
    expect(describeReviewError(new ApiError('network', 'x')).uncertain).toBe(true)
    expect(describeReviewError(new ApiError('network', 'x')).message).toBe(
      'Could not reach the backend service.',
    )
  })

  it('handles non-ApiError values without leaking detail', () => {
    const info = describeReviewError(new Error('boom: secret stack'))
    expect(info.message).not.toMatch(/boom|secret/)
  })
})
