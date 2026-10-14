import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_HISTORY_OFFSET,
  DEFAULT_HISTORY_ORDER,
  getAnalysisById,
  getClaimAnalysisHistory,
  getClaimById,
  parseAnalysisHistoryPage,
  parseClaimDetails,
  parseSavedAnalysis,
} from './retrieval'
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

function claimPayload(): Record<string, unknown> {
  return {
    claim_id: 'CLM-1',
    policy_id: 'POL-1',
    created_at: '2024-05-01T10:00:00',
    policy_state: 'CA',
    claim_amount: 18500,
    incident_type: 'Parked Car',
    incident_date: '2024-05-01',
  }
}

function analysisPayload(): Record<string, unknown> {
  return {
    analysis_id: 'A-1',
    claim_id: 'CLM-1',
    analyzed_at: '2024-05-02T09:30:00',
    fraud: { probability: 0.12 },
    severity: { predicted_claim_amount: 12000 },
    anomaly: { score: 0.31 },
    risk: {
      score: 55,
      level: 'HIGH',
      components: { fraud: 12, anomaly: 31, severity: 80 },
    },
    explanation: { risk: { summary: 'example' } },
    decision: { recommendation: 'REVIEW' },
  }
}

function historyPayload(): Record<string, unknown> {
  return {
    items: [
      {
        analysis_id: 'A-2',
        analyzed_at: '2024-05-03T09:00:00',
        fraud_probability: 0.2,
        predicted_claim_amount: 9000,
        anomaly_score: 0.1,
        risk_score: 40,
        risk_level: 'MEDIUM',
        recommendation: 'ROUTINE_REVIEW',
      },
      {
        analysis_id: 'A-1',
        analyzed_at: '2024-05-02T09:00:00',
        fraud_probability: 0.12,
        predicted_claim_amount: 12000,
        anomaly_score: 0.31,
        risk_score: 55,
        risk_level: 'HIGH',
        recommendation: 'REVIEW',
      },
    ],
    total: 5,
    limit: 20,
    offset: 0,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getClaimById', () => {
  it('GETs the claim endpoint and returns the persisted details', async () => {
    const fetchMock = mockFetch(async () =>
      fakeResponse(JSON.stringify(claimPayload())),
    )

    const result = await getClaimById('CLM-1', { baseUrl: BASE })

    expect(result).toEqual(claimPayload())
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/v1/claims/CLM-1`)
    expect(init.method).toBe('GET')
  })
})

describe('getAnalysisById', () => {
  it('GETs the analysis endpoint and returns the nested payload', async () => {
    const fetchMock = mockFetch(async () =>
      fakeResponse(JSON.stringify(analysisPayload())),
    )

    const result = await getAnalysisById('A-1', { baseUrl: BASE })

    expect(result.analysis_id).toBe('A-1')
    expect(result.claim_id).toBe('CLM-1')
    expect(result.fraud.probability).toBe(0.12)
    expect(result.severity.predicted_claim_amount).toBe(12000)
    expect(result.anomaly.score).toBe(0.31)
    expect(result.risk.score).toBe(55)
    expect(result.risk.level).toBe('HIGH')
    expect(result.risk.components).toEqual({
      fraud: 12,
      anomaly: 31,
      severity: 80,
    })
    expect(result.explanation).toEqual({ risk: { summary: 'example' } })
    expect(result.decision).toEqual({ recommendation: 'REVIEW' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/v1/analyses/A-1`)
    expect(init.method).toBe('GET')
  })
})

describe('getClaimAnalysisHistory', () => {
  it('uses the backend defaults for limit, offset and order', async () => {
    const fetchMock = mockFetch(async () =>
      fakeResponse(JSON.stringify(historyPayload())),
    )

    const result = await getClaimAnalysisHistory('CLM-1', { baseUrl: BASE })

    expect(DEFAULT_HISTORY_LIMIT).toBe(20)
    expect(DEFAULT_HISTORY_OFFSET).toBe(0)
    expect(DEFAULT_HISTORY_ORDER).toBe('desc')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      `${BASE}/api/v1/claims/CLM-1/analyses?limit=20&offset=0&order=desc`,
    )
    expect(init.method).toBe('GET')
    expect(result.total).toBe(5)
    expect(result.limit).toBe(20)
    expect(result.offset).toBe(0)
    expect(result.items).toHaveLength(2)
    expect(result.items[0].analysis_id).toBe('A-2')
    expect(result.items[0].risk_level).toBe('MEDIUM')
  })

  it('serialises custom limit, offset and order', async () => {
    const fetchMock = mockFetch(async () =>
      fakeResponse(JSON.stringify(historyPayload())),
    )

    await getClaimAnalysisHistory('CLM-1', {
      baseUrl: BASE,
      limit: 5,
      offset: 10,
      order: 'asc',
    })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      `${BASE}/api/v1/claims/CLM-1/analyses?limit=5&offset=10&order=asc`,
    )
  })

  it('keeps request options separate from query parameters', async () => {
    const fetchMock = mockFetch(async () =>
      fakeResponse(JSON.stringify(historyPayload())),
    )

    await getClaimAnalysisHistory('CLM-1', {
      baseUrl: BASE,
      timeoutMs: 25,
      order: 'asc',
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      `${BASE}/api/v1/claims/CLM-1/analyses?limit=20&offset=0&order=asc`,
    )
    // `timeoutMs` must not leak into the query string.
    expect(url).not.toContain('timeoutMs')
    expect(init.method).toBe('GET')
  })
})

describe('identifier path encoding', () => {
  it('encodes reserved characters in a claim id as a single path segment', async () => {
    const fetchMock = mockFetch(async () =>
      fakeResponse(JSON.stringify(claimPayload())),
    )
    const tricky = 'a b/c%d?e#f'

    await getClaimById(tricky, { baseUrl: BASE })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/v1/claims/${encodeURIComponent(tricky)}`)
    expect(url).not.toContain('%252F') // no double-encoding of "/"
    expect(url).not.toContain('%2520') // no double-encoding of " "
  })

  it('encodes reserved characters in an analysis id', async () => {
    const fetchMock = mockFetch(async () =>
      fakeResponse(JSON.stringify(analysisPayload())),
    )
    const tricky = 'id/with spaces%20'

    await getAnalysisById(tricky, { baseUrl: BASE })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/v1/analyses/${encodeURIComponent(tricky)}`)
  })

  it('encodes reserved characters in the history claim id', async () => {
    const fetchMock = mockFetch(async () =>
      fakeResponse(JSON.stringify(historyPayload())),
    )
    const tricky = 'x/y z'

    await getClaimAnalysisHistory(tricky, { baseUrl: BASE })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      `${BASE}/api/v1/claims/${encodeURIComponent(
        tricky,
      )}/analyses?limit=20&offset=0&order=desc`,
    )
  })
})

describe('error handling', () => {
  it('keeps a 404 as a typed HTTP error, not an empty result', async () => {
    const detail = { detail: 'Claim not found' }
    mockFetch(async () => fakeResponse(JSON.stringify(detail), 404))

    const error = await getClaimById('missing', { baseUrl: BASE }).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).kind).toBe('http')
    expect((error as ApiError).status).toBe(404)
    expect((error as ApiError).details).toEqual(detail)
  })

  it('reports server failures with their status', async () => {
    mockFetch(async () => fakeResponse('boom', 500))

    const error = await getAnalysisById('A-1', { baseUrl: BASE }).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).kind).toBe('http')
    expect((error as ApiError).status).toBe(500)
  })

  it('reports network failures as network errors', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    await expect(
      getClaimAnalysisHistory('CLM-1', { baseUrl: BASE }),
    ).rejects.toMatchObject({ kind: 'network' })
  })

  it('rejects non-JSON responses as parse errors', async () => {
    mockFetch(async () => fakeResponse('<html>not json</html>'))

    await expect(getClaimById('CLM-1', { baseUrl: BASE })).rejects.toMatchObject(
      { kind: 'parse' },
    )
  })
})

describe('response parsing and nullability', () => {
  it('preserves null claim fields instead of fabricating values', () => {
    const parsed = parseClaimDetails({
      claim_id: 'CLM-1',
      policy_id: null,
      created_at: null,
      policy_state: null,
      claim_amount: null,
      incident_type: null,
      incident_date: null,
    })
    expect(parsed).toEqual({
      claim_id: 'CLM-1',
      policy_id: null,
      created_at: null,
      policy_state: null,
      claim_amount: null,
      incident_type: null,
      incident_date: null,
    })
  })

  it('rejects a claim payload that is not an object', () => {
    expect(() => parseClaimDetails(null)).toThrow(ApiError)
    expect(() => parseClaimDetails([])).toThrow(ApiError)
  })

  it('preserves null saved-analysis sections and leaves', () => {
    const parsed = parseSavedAnalysis({
      analysis_id: 'A-1',
      claim_id: 'CLM-1',
      analyzed_at: null,
      fraud: { probability: null },
      severity: { predicted_claim_amount: null },
      anomaly: { score: null },
      risk: { score: null, level: null, components: null },
      explanation: null,
      decision: null,
    })
    expect(parsed.analyzed_at).toBeNull()
    expect(parsed.fraud.probability).toBeNull()
    expect(parsed.risk.components).toBeNull()
    expect(parsed.explanation).toBeNull()
    expect(parsed.decision).toBeNull()
  })

  it('requires the nested saved-analysis sections', () => {
    const payload = analysisPayload()
    delete (payload as Record<string, unknown>).risk
    expect(() => parseSavedAnalysis(payload)).toThrow(ApiError)
  })

  it('parses a history page and preserves null item fields', () => {
    const parsed = parseAnalysisHistoryPage({
      items: [
        {
          analysis_id: 'A-1',
          analyzed_at: null,
          fraud_probability: null,
          predicted_claim_amount: null,
          anomaly_score: null,
          risk_score: null,
          risk_level: null,
          recommendation: null,
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    })
    expect(parsed.total).toBe(1)
    expect(parsed.items[0].risk_level).toBeNull()
    expect(parsed.items[0].recommendation).toBeNull()
  })

  it('rejects a history payload without an items list', () => {
    expect(() =>
      parseAnalysisHistoryPage({ total: 0, limit: 20, offset: 0 }),
    ).toThrow(ApiError)
  })
})
