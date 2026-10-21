import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'

/**
 * Frontend integration workflow test.
 *
 * Unlike the other frontend suites, this one does NOT mock the dashboard,
 * retrieval or review API modules. Instead it stubs global `fetch` and answers
 * the real `/api/v1/...` routes from a small stateful fake backend, so the real
 * API client (`requestJson`), the real response parsers and the real pages run
 * end to end:
 *
 *   dashboard queue row  ->  saved analysis details  ->  submit human review
 *                        ->  refresh and display the saved review
 *
 * It is a jsdom component/navigation integration test, not a browser E2E test:
 * there is no live backend and no browser. All mocks are restored after each
 * test.
 */

const V1 = '/api/v1'

/** A canonical dashboard summary fixture, shaped exactly like the backend. */
function summaryFixture(overrides: Record<string, unknown> = {}) {
  const zero = { total: 0, awaiting_review: 0, reviewed: 0 }
  return {
    totals: { claims: 1, analyses: 1, reviews: 0 },
    high_critical_analyses: 1,
    analyses_with_reviews: 0,
    analyses_awaiting_review: 1,
    risk_distribution: {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 1,
      CRITICAL: 0,
      UNKNOWN: 0,
    },
    review_outcomes: {
      APPROVED: 0,
      REJECTED: 0,
      NEEDS_MORE_INFO: 0,
      ESCALATED: 0,
      UNKNOWN: 0,
    },
    latest_review_outcomes: {
      APPROVED: 0,
      REJECTED: 0,
      NEEDS_MORE_INFO: 0,
      ESCALATED: 0,
      UNKNOWN: 0,
    },
    recent_analyses: [
      {
        analysis_id: 'AN-E2E',
        claim_id: 'CLM-E2E',
        analyzed_at: '2024-05-02T09:30:00',
        fraud_probability: 0.4,
        predicted_claim_amount: 9000,
        anomaly_score: 0.18,
        risk_score: 71.5,
        risk_level: 'HIGH',
        recommendation: 'ENHANCED_REVIEW',
      },
    ],
    risk_review_status: {
      LOW: { ...zero },
      MEDIUM: { ...zero },
      HIGH: { total: 1, awaiting_review: 1, reviewed: 0 },
      CRITICAL: { ...zero },
      UNKNOWN: { ...zero },
    },
    recent_reviews: [],
    oldest_awaiting_analyzed_at: '2024-05-02T09:30:00',
    ...overrides,
  }
}

/** A queue page containing exactly the analysis the flow will open. */
function queueFixture() {
  return {
    items: [
      {
        analysis_id: 'AN-E2E',
        claim_id: 'CLM-E2E',
        analyzed_at: '2024-05-02T09:30:00',
        risk_score: 71.5,
        risk_level: 'HIGH',
        fraud_probability: 0.4,
        predicted_claim_amount: 9000,
        anomaly_score: 0.18,
        recommendation: 'ENHANCED_REVIEW',
        review_count: 0,
        latest_review_outcome: null,
        latest_reviewed_at: null,
        incident_type: 'Collision',
        claim_amount: 9000,
      },
    ],
    total: 1,
    limit: 10,
    offset: 0,
  }
}

/** The saved-analysis detail payload for AN-E2E (matches AnalysisDB). */
function analysisFixture() {
  return {
    analysis_id: 'AN-E2E',
    claim_id: 'CLM-E2E',
    analyzed_at: '2024-05-02T09:30:00',
    fraud: { probability: 0.4 },
    severity: { predicted_claim_amount: 9000 },
    anomaly: { score: 0.18 },
    risk: { score: 71.5, level: 'HIGH', components: null },
    explanation: null,
    decision: {
      recommendation: 'ENHANCED_REVIEW',
      priority: 'HIGH',
      human_decision_required: true,
      triggered_rules: [],
    },
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

interface FakeBackend {
  reviews: Array<{
    review_id: string
    final_decision: string
    reviewer_id: string | null
    comments: string | null
    reviewed_at: string
    analysis_id: string
    claim_id: string
  }>
}

/**
 * Install a fake backend that serves the real endpoints from the fixtures. The
 * review POST mutates in-memory state so the subsequent reviews GET (which the
 * details page performs after a successful save) returns what was "persisted",
 * mirroring the real backend behaviour.
 */
function installFakeBackend(): FakeBackend {
  const backend: FakeBackend = { reviews: [] }

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()

      if (url.includes(`${V1}/ready`)) {
        return jsonResponse({ status: 'ready', models_loaded: true })
      }
      if (url.includes(`${V1}/health`)) {
        return jsonResponse({ status: 'healthy' })
      }
      if (url.includes(`${V1}/dashboard/summary`)) {
        const reviewsRecorded = backend.reviews.length
        return jsonResponse(
          summaryFixture({
            totals: { claims: 1, analyses: 1, reviews: reviewsRecorded },
            analyses_with_reviews: reviewsRecorded > 0 ? 1 : 0,
            analyses_awaiting_review: reviewsRecorded > 0 ? 0 : 1,
            recent_reviews: backend.reviews.map((r) => ({
              review_id: r.review_id,
              final_decision: r.final_decision,
              reviewer_id: r.reviewer_id,
              reviewed_at: r.reviewed_at,
              analysis_id: r.analysis_id,
              claim_id: r.claim_id,
              risk_level: 'HIGH',
            })),
          }),
        )
      }
      if (url.includes(`${V1}/dashboard/review-queue`)) {
        return jsonResponse(queueFixture())
      }
      if (url.includes(`${V1}/analyses/AN-E2E/reviews`) && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          final_decision: string
          reviewer_id?: string
          comments?: string
        }
        const saved = {
          review_id: `REV-${backend.reviews.length + 1}`,
          final_decision: body.final_decision,
          reviewer_id: body.reviewer_id ?? null,
          comments: body.comments ?? null,
          reviewed_at: '2024-05-03T09:30:00',
          analysis_id: 'AN-E2E',
          claim_id: 'CLM-E2E',
        }
        backend.reviews = [saved, ...backend.reviews]
        return jsonResponse(saved, 201)
      }
      if (url.includes(`${V1}/analyses/AN-E2E/reviews`) && method === 'GET') {
        return jsonResponse(backend.reviews)
      }
      if (url.includes(`${V1}/analyses/AN-E2E`)) {
        return jsonResponse(analysisFixture())
      }
      return jsonResponse({ detail: 'Not found' }, 404)
    }),
  )

  return backend
}

beforeEach(() => {
  installFakeBackend()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('dashboard -> details -> review integration', () => {
  it('opens a saveable analysis from the queue and records a human review', async () => {
    render(<App />)

    // 1. The dashboard summary loads through the real client and parser.
    const queueTable = await screen.findByRole('table', {
      name: /analyses awaiting a human decision/i,
    })
    expect(within(queueTable).getByText('AN-E2E')).toBeDefined()

    // 2. Open the saved analysis from the queue row.
    const openButtons = screen.getAllByRole('button', {
      name: /view details for analysis AN-E2E/i,
    })
    fireEvent.click(openButtons[0])

    // The details page fetches the saved analysis via the real retrieval client.
    expect(await screen.findByText('Analysis ID: AN-E2E')).toBeDefined()
    // The human-in-the-loop signal is rendered from the stored decision payload.
    expect(
      screen.getByText(/human decision required/i),
    ).toBeDefined()

    // 3. Record a human review. The outcome select is required.
    const reviewForm = await screen.findByRole('form', {
      name: /human review form/i,
    })
    const outcome = within(reviewForm).getByLabelText(/outcome/i)
    fireEvent.change(outcome, { target: { value: 'APPROVED' } })
    fireEvent.change(within(reviewForm).getByLabelText(/reviewer id/i), {
      target: { value: 'OFFICER-9' },
    })
    fireEvent.change(within(reviewForm).getByLabelText(/notes/i), {
      target: { value: 'Verified documents.' },
    })
    fireEvent.click(
      within(reviewForm).getByRole('button', { name: /save review/i }),
    )

    // 4. The save succeeds and the panel re-fetches, displaying the saved review.
    //    ("Review saved" appears both in the visible callout and the aria-live
    //    announcement, so match all occurrences.)
    await waitFor(() => {
      expect(screen.getAllByText(/review saved/i).length).toBeGreaterThan(0)
    })
    // The persisted review is shown back from the server, not from local state.
    expect(await screen.findByText('REV-1')).toBeDefined()
    expect(screen.getByText('Verified documents.')).toBeDefined()
    expect(screen.getAllByText('APPROVED').length).toBeGreaterThan(0)
  })

  it('blocks a review submission that has no outcome selected', async () => {
    render(<App />)

    const queueTable = await screen.findByRole('table', {
      name: /analyses awaiting a human decision/i,
    })
    expect(within(queueTable).getByText('AN-E2E')).toBeDefined()

    fireEvent.click(
      screen.getAllByRole('button', {
        name: /view details for analysis AN-E2E/i,
      })[0],
    )
    const reviewForm = await screen.findByRole('form', {
      name: /human review form/i,
    })

    fireEvent.click(
      within(reviewForm).getByRole('button', { name: /save review/i }),
    )

    // Client-side validation stops the request; nothing is "saved".
    // The error appears both on the field and in the aria-live announcement.
    expect(
      (await screen.findAllByText(/select a review outcome/i)).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText(/review saved/i)).toBeNull()
  })
})

/**
 * Error-path integration (P4).
 *
 * The UI error states are unit-tested elsewhere by rejecting the *API module*
 * mocks. These tests cover the one seam those cannot: a real HTTP status or a
 * real network failure flowing through the real `requestJson` client and into
 * the distinct UI states, so 404 / 5xx / offline are never conflated.
 */
describe('real fetch error paths surface distinct states', () => {
  it('shows "Dashboard unavailable" when the summary returns a real 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes(`${V1}/ready`)) {
          return jsonResponse({ status: 'ready', models_loaded: true })
        }
        if (url.includes(`${V1}/health`)) {
          return jsonResponse({ status: 'healthy' })
        }
        if (url.includes(`${V1}/dashboard/summary`)) {
          // A real missing endpoint (e.g. an older backend) is a 404.
          return jsonResponse({ detail: 'Not Found' }, 404)
        }
        return jsonResponse(queueFixture())
      }),
    )

    render(<App />)

    expect(await screen.findByText(/dashboard unavailable/i)).toBeDefined()
  })

  it('shows a server-error state when details return a real 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes(`${V1}/ready`)) {
          return jsonResponse({ status: 'ready', models_loaded: true })
        }
        if (url.includes(`${V1}/health`)) {
          return jsonResponse({ status: 'healthy' })
        }
        if (url.includes(`${V1}/dashboard/summary`)) {
          return jsonResponse(summaryFixture())
        }
        if (url.includes(`${V1}/dashboard/review-queue`)) {
          return jsonResponse(queueFixture())
        }
        if (url.includes(`${V1}/analyses/AN-E2E`)) {
          // A real server error, distinct from 404 and from "no data".
          return jsonResponse({ detail: 'Internal Server Error' }, 500)
        }
        return jsonResponse({ detail: 'Not found' }, 404)
      }),
    )

    render(<App />)

    const queueTable = await screen.findByRole('table', {
      name: /analyses awaiting a human decision/i,
    })
    expect(within(queueTable).getByText('AN-E2E')).toBeDefined()
    fireEvent.click(
      screen.getAllByRole('button', {
        name: /view details for analysis AN-E2E/i,
      })[0],
    )

    expect(
      await screen.findByText(/the saved analysis could not be loaded/i),
    ).toBeDefined()
    // A server error must not be shown as "no saved analysis found".
    expect(screen.queryByText(/no saved analysis found/i)).toBeNull()
  })

  it('shows a network state when the details request cannot connect', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes(`${V1}/ready`)) {
          return jsonResponse({ status: 'ready', models_loaded: true })
        }
        if (url.includes(`${V1}/health`)) {
          return jsonResponse({ status: 'healthy' })
        }
        if (url.includes(`${V1}/dashboard/summary`)) {
          return jsonResponse(summaryFixture())
        }
        if (url.includes(`${V1}/dashboard/review-queue`)) {
          return jsonResponse(queueFixture())
        }
        if (url.includes(`${V1}/analyses/AN-E2E`)) {
          // A real transport failure (offline / connection refused).
          throw new TypeError('Failed to fetch')
        }
        return jsonResponse({ detail: 'Not found' }, 404)
      }),
    )

    render(<App />)

    const queueTable = await screen.findByRole('table', {
      name: /analyses awaiting a human decision/i,
    })
    expect(within(queueTable).getByText('AN-E2E')).toBeDefined()
    fireEvent.click(
      screen.getAllByRole('button', {
        name: /view details for analysis AN-E2E/i,
      })[0],
    )

    expect(
      await screen.findByText(/the backend could not be reached/i),
    ).toBeDefined()
  })
})
