import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_DASHBOARD_RECENT_LIMIT,
  DEFAULT_REVIEW_QUEUE_LIMIT,
  DEFAULT_REVIEW_QUEUE_OFFSET,
  DEFAULT_REVIEW_QUEUE_ORDER,
  DEFAULT_REVIEW_QUEUE_SCOPE,
  getDashboardSummary,
  getReviewQueue,
  parseDashboardSummary,
  parseReviewQueue,
  type DashboardReviewQueuePage,
  type DashboardSummary,
} from './dashboard'
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

/** A summary payload matching the real backend `DashboardSummaryDB` contract. */
function summaryPayload(
  overrides: Partial<DashboardSummary> = {},
): Record<string, unknown> {
  const base: DashboardSummary = {
    totals: { claims: 2, analyses: 3, reviews: 4 },
    high_critical_analyses: 1,
    analyses_with_reviews: 2,
    analyses_awaiting_review: 1,
    risk_distribution: { LOW: 1, MEDIUM: 1, HIGH: 1, CRITICAL: 0, UNKNOWN: 0 },
    review_outcomes: {
      APPROVED: 2,
      REJECTED: 1,
      NEEDS_MORE_INFO: 1,
      ESCALATED: 0,
      UNKNOWN: 0,
    },
    latest_review_outcomes: {
      APPROVED: 1,
      REJECTED: 1,
      NEEDS_MORE_INFO: 0,
      ESCALATED: 0,
      UNKNOWN: 0,
    },
    recent_analyses: [
      {
        analysis_id: 'AN-1',
        claim_id: 'CLM-1',
        analyzed_at: '2024-05-02T09:30:00',
        fraud_probability: 0.2,
        predicted_claim_amount: 12000,
        anomaly_score: 0.31,
        risk_score: 44,
        risk_level: 'MEDIUM',
        recommendation: 'ENHANCED_REVIEW',
      },
    ],
    risk_review_status: {
      LOW: { total: 1, awaiting_review: 0, reviewed: 1 },
      MEDIUM: { total: 1, awaiting_review: 1, reviewed: 0 },
      HIGH: { total: 1, awaiting_review: 1, reviewed: 0 },
      CRITICAL: { total: 0, awaiting_review: 0, reviewed: 0 },
      UNKNOWN: { total: 0, awaiting_review: 0, reviewed: 0 },
    },
    recent_reviews: [
      {
        review_id: 'REV-1',
        final_decision: 'APPROVED',
        reviewer_id: 'OFFICER-1',
        reviewed_at: '2024-05-03T09:30:00',
        analysis_id: 'AN-1',
        claim_id: 'CLM-1',
        risk_level: 'MEDIUM',
      },
    ],
    oldest_awaiting_analyzed_at: '2024-05-01T08:00:00',
  }
  return { ...base, ...overrides }
}

/** A review-queue payload matching the real backend `DashboardReviewQueueDB`. */
function queuePayload(
  overrides: Partial<DashboardReviewQueuePage> = {},
): Record<string, unknown> {
  const base: DashboardReviewQueuePage = {
    items: [
      {
        analysis_id: 'AN-1',
        claim_id: 'CLM-1',
        analyzed_at: '2024-05-02T09:30:00',
        risk_score: 88,
        risk_level: 'HIGH',
        fraud_probability: 0.72,
        predicted_claim_amount: 3900,
        anomaly_score: 0.41,
        recommendation: 'ENHANCED_REVIEW',
        review_count: 0,
        latest_review_outcome: null,
        latest_reviewed_at: null,
        incident_type: 'collision',
        claim_amount: 4200.5,
      },
    ],
    total: 1,
    limit: DEFAULT_REVIEW_QUEUE_LIMIT,
    offset: DEFAULT_REVIEW_QUEUE_OFFSET,
  }
  return { ...base, ...overrides }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getDashboardSummary', () => {
  it('GETs the summary with the default recent limit', async () => {
    const fetchMock = mockFetch(async () =>
      fakeResponse(JSON.stringify(summaryPayload())),
    )

    const summary = await getDashboardSummary({ baseUrl: BASE })

    expect(summary.totals.analyses).toBe(3)
    expect(summary.risk_distribution.HIGH).toBe(1)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      `${BASE}/api/v1/dashboard/summary?recent_limit=${DEFAULT_DASHBOARD_RECENT_LIMIT}`,
    )
    expect(init.method).toBe('GET')
  })

  it('serialises an explicit recent limit', async () => {
    const fetchMock = mockFetch(async () =>
      fakeResponse(JSON.stringify(summaryPayload())),
    )

    await getDashboardSummary({ recentLimit: 3, baseUrl: BASE })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/v1/dashboard/summary?recent_limit=3`)
  })

  it('rejects an unexpected response shape with a parse error', async () => {
    mockFetch(async () => fakeResponse(JSON.stringify({ status: 'healthy' })))
    await expect(
      getDashboardSummary({ baseUrl: BASE }),
    ).rejects.toMatchObject({ kind: 'parse' })
  })

  it('propagates a server error as an HTTP ApiError', async () => {
    mockFetch(async () =>
      fakeResponse(
        JSON.stringify({ detail: 'The dashboard summary could not be retrieved' }),
        500,
      ),
    )
    const error = await getDashboardSummary({ baseUrl: BASE }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).kind).toBe('http')
    expect((error as ApiError).status).toBe(500)
  })

  it('keeps a 404 distinct from a network failure', async () => {
    mockFetch(async () => fakeResponse(JSON.stringify({ detail: 'nope' }), 404))
    const error = await getDashboardSummary({ baseUrl: BASE }).catch(
      (e: unknown) => e,
    )
    expect((error as ApiError).kind).toBe('http')
    expect((error as ApiError).status).toBe(404)
  })

  it('rejects with a network error when fetch fails', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(
      getDashboardSummary({ baseUrl: BASE }),
    ).rejects.toMatchObject({ kind: 'network' })
  })
})

describe('parseDashboardSummary', () => {
  it('parses a complete payload, preserving null recent fields', () => {
    const parsed = parseDashboardSummary(
      summaryPayload({
        recent_analyses: [
          {
            analysis_id: null,
            claim_id: null,
            analyzed_at: null,
            fraud_probability: null,
            predicted_claim_amount: null,
            anomaly_score: null,
            risk_score: null,
            risk_level: null,
            recommendation: null,
          },
        ],
      }),
    )

    expect(parsed.totals).toEqual({ claims: 2, analyses: 3, reviews: 4 })
    expect(parsed.high_critical_analyses).toBe(1)
    expect(parsed.review_outcomes.APPROVED).toBe(2)
    expect(parsed.latest_review_outcomes.REJECTED).toBe(1)
    expect(parsed.recent_analyses[0]).toEqual({
      analysis_id: null,
      claim_id: null,
      analyzed_at: null,
      fraud_probability: null,
      predicted_claim_amount: null,
      anomaly_score: null,
      risk_score: null,
      risk_level: null,
      recommendation: null,
    })
  })

  it('rejects a non-object payload', () => {
    expect(() => parseDashboardSummary([])).toThrow(ApiError)
    expect(() => parseDashboardSummary('nope')).toThrow(ApiError)
  })

  it('rejects a payload without a recent_analyses list', () => {
    const { recent_analyses: _omit, ...rest } = summaryPayload()
    expect(() => parseDashboardSummary(rest)).toThrow(ApiError)
  })

  it('rejects a negative or non-integer count', () => {
    expect(() =>
      parseDashboardSummary({
        ...summaryPayload(),
        high_critical_analyses: -1,
      }),
    ).toThrow(ApiError)

    expect(() =>
      parseDashboardSummary({
        ...summaryPayload(),
        risk_distribution: { LOW: 1.5, MEDIUM: 0, HIGH: 0, CRITICAL: 0, UNKNOWN: 0 },
      }),
    ).toThrow(ApiError)
  })

  it('rejects a recent analysis with a wrongly typed field', () => {
    expect(() =>
      parseDashboardSummary(
        summaryPayload({
          recent_analyses: [
            {
              analysis_id: 'AN-1',
              claim_id: 'CLM-1',
              analyzed_at: '2024-05-02T09:30:00',
              fraud_probability: 'twenty percent',
              predicted_claim_amount: null,
              anomaly_score: null,
              risk_score: null,
              risk_level: null,
              recommendation: null,
            } as unknown as DashboardSummary['recent_analyses'][number],
          ],
        }),
      ),
    ).toThrow(ApiError)
  })

  it('parses the new risk/review-status, recent-review and aging fields', () => {
    const parsed = parseDashboardSummary(summaryPayload())

    expect(parsed.risk_review_status.HIGH).toEqual({
      total: 1,
      awaiting_review: 1,
      reviewed: 0,
    })
    expect(parsed.recent_reviews[0].reviewer_id).toBe('OFFICER-1')
    expect(parsed.oldest_awaiting_analyzed_at).toBe('2024-05-01T08:00:00')
  })

  it('rejects a payload missing the new review-insight fields', () => {
    const { risk_review_status: _status, ...withoutStatus } = summaryPayload()
    expect(() => parseDashboardSummary(withoutStatus)).toThrow(ApiError)

    const { recent_reviews: _reviews, ...withoutReviews } = summaryPayload()
    expect(() => parseDashboardSummary(withoutReviews)).toThrow(ApiError)
  })
})

describe('getReviewQueue', () => {
  it('GETs the queue with the default parameters', async () => {
    const fetchMock = mockFetch(async () =>
      fakeResponse(JSON.stringify(queuePayload())),
    )

    const page = await getReviewQueue({ baseUrl: BASE })

    expect(page.total).toBe(1)
    expect(page.items[0].analysis_id).toBe('AN-1')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      `${BASE}/api/v1/dashboard/review-queue?limit=${DEFAULT_REVIEW_QUEUE_LIMIT}` +
        `&offset=${DEFAULT_REVIEW_QUEUE_OFFSET}` +
        `&scope=${DEFAULT_REVIEW_QUEUE_SCOPE}` +
        `&order=${DEFAULT_REVIEW_QUEUE_ORDER}`,
    )
    expect(init.method).toBe('GET')
  })

  it('serialises scope, order, pagination and a trimmed risk filter', async () => {
    const fetchMock = mockFetch(async () =>
      fakeResponse(JSON.stringify(queuePayload())),
    )

    await getReviewQueue({
      scope: 'open',
      order: 'recent',
      limit: 5,
      offset: 10,
      riskLevel: '  high ',
      baseUrl: BASE,
    })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      `${BASE}/api/v1/dashboard/review-queue?limit=5&offset=10&scope=open` +
        `&order=recent&risk_level=high`,
    )
  })

  it('omits the risk filter when blank', async () => {
    const fetchMock = mockFetch(async () =>
      fakeResponse(JSON.stringify(queuePayload())),
    )

    await getReviewQueue({ riskLevel: '   ', baseUrl: BASE })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).not.toContain('risk_level')
  })

  it('rejects an unexpected response shape with a parse error', async () => {
    mockFetch(async () => fakeResponse(JSON.stringify({ items: 'nope' })))
    await expect(getReviewQueue({ baseUrl: BASE })).rejects.toMatchObject({
      kind: 'parse',
    })
  })

  it('keeps a 404 distinct from a network failure', async () => {
    mockFetch(async () => fakeResponse(JSON.stringify({ detail: 'nope' }), 404))
    const error = await getReviewQueue({ baseUrl: BASE }).catch((e: unknown) => e)
    expect((error as ApiError).kind).toBe('http')
    expect((error as ApiError).status).toBe(404)
  })

  it('propagates a server error as an HTTP ApiError', async () => {
    mockFetch(async () =>
      fakeResponse(
        JSON.stringify({ detail: 'The review queue could not be retrieved' }),
        500,
      ),
    )
    const error = await getReviewQueue({ baseUrl: BASE }).catch((e: unknown) => e)
    expect((error as ApiError).kind).toBe('http')
    expect((error as ApiError).status).toBe(500)
  })

  it('rejects with a network error when fetch fails', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(getReviewQueue({ baseUrl: BASE })).rejects.toMatchObject({
      kind: 'network',
    })
  })
})

describe('parseReviewQueue', () => {
  it('parses items and preserves null review fields', () => {
    const parsed = parseReviewQueue(
      queuePayload({
        items: [
          {
            analysis_id: null,
            claim_id: null,
            analyzed_at: null,
            risk_score: null,
            risk_level: null,
            fraud_probability: null,
            predicted_claim_amount: null,
            anomaly_score: null,
            recommendation: null,
            review_count: 0,
            latest_review_outcome: null,
            latest_reviewed_at: null,
            incident_type: null,
            claim_amount: null,
          },
        ],
      }),
    )

    expect(parsed.items[0]).toEqual({
      analysis_id: null,
      claim_id: null,
      analyzed_at: null,
      risk_score: null,
      risk_level: null,
      fraud_probability: null,
      predicted_claim_amount: null,
      anomaly_score: null,
      recommendation: null,
      review_count: 0,
      latest_review_outcome: null,
      latest_reviewed_at: null,
      incident_type: null,
      claim_amount: null,
    })
  })

  it('rejects a non-object payload and a missing items list', () => {
    expect(() => parseReviewQueue([])).toThrow(ApiError)
    expect(() => parseReviewQueue('nope')).toThrow(ApiError)
    const { items: _omit, ...rest } = queuePayload()
    expect(() => parseReviewQueue(rest)).toThrow(ApiError)
  })

  it('rejects a negative review count', () => {
    expect(() =>
      parseReviewQueue(
        queuePayload({
          items: [
            {
              ...(queuePayload().items as DashboardReviewQueuePage['items'])[0],
              review_count: -1,
            },
          ],
        }),
      ),
    ).toThrow(ApiError)
  })
})
