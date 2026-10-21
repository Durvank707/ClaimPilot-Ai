import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import App from './App'
import {
  getAnalysisById,
  getClaimAnalysisHistory,
  type AnalysisHistoryItem,
  type AnalysisHistoryPage,
  type SavedAnalysis,
} from './api/retrieval'
import { getAnalysisReviews } from './api/reviews'
import {
  getDashboardSummary,
  getReviewQueue,
  type DashboardRecentAnalysis,
  type DashboardSummary,
} from './api/dashboard'

// Mock the retrieval API functions so the navigation flow needs no backend.
// The same mocked module backs every page that imports it (App does not import
// it directly, but ClaimsHistoryPage and SavedAnalysisDetailsPage do).
vi.mock('./api/retrieval', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/retrieval')>()
  return {
    ...actual,
    getClaimAnalysisHistory: vi.fn(),
    getAnalysisById: vi.fn(),
  }
})

// The human review panel (rendered by SavedAnalysisDetailsPage) is mocked too.
vi.mock('./api/reviews', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/reviews')>()
  return {
    ...actual,
    createReview: vi.fn(),
    getAnalysisReviews: vi.fn(),
  }
})

// The dashboard landing page loads a summary on mount; mock it so the shell
// needs no backend.
vi.mock('./api/dashboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/dashboard')>()
  return {
    ...actual,
    getDashboardSummary: vi.fn(),
    getReviewQueue: vi.fn(),
  }
})

const mockedHistory = vi.mocked(getClaimAnalysisHistory)
const mockedAnalysis = vi.mocked(getAnalysisById)
const mockedReviews = vi.mocked(getAnalysisReviews)
const mockedDashboard = vi.mocked(getDashboardSummary)
const mockedQueue = vi.mocked(getReviewQueue)

function fakeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

function historyItem(
  overrides: Partial<AnalysisHistoryItem> = {},
): AnalysisHistoryItem {
  return {
    analysis_id: 'AN-1',
    analyzed_at: '2024-05-01T10:00:00',
    fraud_probability: 0.375,
    predicted_claim_amount: 18500,
    anomaly_score: -0.047,
    risk_score: 31.2,
    risk_level: 'MEDIUM',
    recommendation: 'ENHANCED_REVIEW',
    ...overrides,
  }
}

function historyPage(items: AnalysisHistoryItem[]): AnalysisHistoryPage {
  return { items, total: items.length, limit: 20, offset: 0 }
}

/** A saved analysis matching the real retrieval contract. */
function savedAnalysis(analysisId: string): SavedAnalysis {
  return {
    analysis_id: analysisId,
    claim_id: 'CLM-1',
    analyzed_at: '2024-05-02T09:30:00',
    fraud: { probability: 0.2 },
    severity: { predicted_claim_amount: 12000 },
    anomaly: { score: 0.31 },
    risk: { score: 44, level: 'MEDIUM', components: null },
    explanation: null,
    decision: null,
  }
}

function recentAnalysis(
  overrides: Partial<DashboardRecentAnalysis> = {},
): DashboardRecentAnalysis {
  return {
    analysis_id: 'AN-1',
    claim_id: 'CLM-1',
    analyzed_at: '2024-05-02T09:30:00',
    fraud_probability: 0.2,
    predicted_claim_amount: 12000,
    anomaly_score: 0.31,
    risk_score: 44,
    risk_level: 'MEDIUM',
    recommendation: 'ENHANCED_REVIEW',
    ...overrides,
  }
}

/** An all-zero dashboard summary, used as the default for the shell tests. */
function emptyDashboard(): DashboardSummary {
  const zero = { total: 0, awaiting_review: 0, reviewed: 0 }
  return {
    totals: { claims: 0, analyses: 0, reviews: 0 },
    high_critical_analyses: 0,
    analyses_with_reviews: 0,
    analyses_awaiting_review: 0,
    risk_distribution: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0, UNKNOWN: 0 },
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
    recent_analyses: [],
    risk_review_status: {
      LOW: { ...zero },
      MEDIUM: { ...zero },
      HIGH: { ...zero },
      CRITICAL: { ...zero },
      UNKNOWN: { ...zero },
    },
    recent_reviews: [],
    oldest_awaiting_analyzed_at: null,
  }
}

/** Click a primary sidebar destination by its visible label. */
function navigateTo(name: RegExp) {
  fireEvent.click(screen.getAllByRole('button', { name })[0])
}

async function searchHistory(claimId: string) {
  const input = screen.getByLabelText(/claim id/i) as HTMLInputElement
  fireEvent.change(input, { target: { value: claimId } })
  fireEvent.click(screen.getByRole('button', { name: /^search$/i }))
}

beforeEach(() => {
  mockedHistory.mockReset()
  mockedAnalysis.mockReset()
  mockedReviews.mockReset()
  mockedReviews.mockResolvedValue([])
  mockedDashboard.mockReset()
  mockedDashboard.mockResolvedValue(emptyDashboard())
  mockedQueue.mockReset()
  mockedQueue.mockResolvedValue({ items: [], total: 0, limit: 10, offset: 0 })

  // The header's connection indicator probes /health and /ready on mount.
  // Answer both locally so no backend is required.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/ready')) {
        return fakeResponse({ status: 'ready', models_loaded: true })
      }
      return fakeResponse({ status: 'healthy' })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App navigation', () => {
  it('opens a saved analysis from a history row and returns to the list', async () => {
    mockedHistory.mockResolvedValueOnce(
      historyPage([
        historyItem({ analysis_id: 'AN-1' }),
        historyItem({ analysis_id: 'AN-2' }),
      ]),
    )
    mockedAnalysis.mockResolvedValueOnce(savedAnalysis('AN-1'))
    render(<App />)

    navigateTo(/claims history/i)
    await searchHistory('CLM-1')

    expect(await screen.findByRole('table')).toBeDefined()
    expect(mockedHistory).toHaveBeenCalledWith('CLM-1', {
      limit: 20,
      offset: 0,
      order: 'desc',
    })

    fireEvent.click(
      screen.getByRole('button', { name: /view details for analysis AN-1/i }),
    )

    // The details page receives the row's exact analysis id.
    expect(await screen.findByText('Analysis ID: AN-1')).toBeDefined()
    expect(mockedAnalysis).toHaveBeenCalledWith('AN-1')

    // Returning restores the list, preserving the earlier search (no refetch).
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }))
    expect(await screen.findByRole('table')).toBeDefined()
    expect(screen.getByText('AN-2')).toBeDefined()
    expect(mockedHistory).toHaveBeenCalledTimes(1)
  })

  it('opens a different analysis after returning to the history list', async () => {
    mockedHistory.mockResolvedValueOnce(
      historyPage([
        historyItem({ analysis_id: 'AN-1' }),
        historyItem({ analysis_id: 'AN-2' }),
      ]),
    )
    mockedAnalysis.mockImplementation(async (id: string) => savedAnalysis(id))
    render(<App />)

    navigateTo(/claims history/i)
    await searchHistory('CLM-1')
    await screen.findByRole('table')

    fireEvent.click(
      screen.getByRole('button', { name: /view details for analysis AN-1/i }),
    )
    expect(await screen.findByText('Analysis ID: AN-1')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: /^back$/i }))
    await screen.findByRole('table')

    fireEvent.click(
      screen.getByRole('button', { name: /view details for analysis AN-2/i }),
    )
    expect(await screen.findByText('Analysis ID: AN-2')).toBeDefined()
    expect(mockedAnalysis).toHaveBeenLastCalledWith('AN-2')
  })

  it('returns to the history list from the details view via the sidebar', async () => {
    mockedHistory.mockResolvedValueOnce(
      historyPage([historyItem({ analysis_id: 'AN-1' })]),
    )
    mockedAnalysis.mockResolvedValueOnce(savedAnalysis('AN-1'))
    render(<App />)

    navigateTo(/claims history/i)
    await searchHistory('CLM-1')
    await screen.findByRole('table')

    fireEvent.click(
      screen.getByRole('button', { name: /view details for analysis AN-1/i }),
    )
    expect(await screen.findByText('Analysis ID: AN-1')).toBeDefined()

    // Choosing the (still-active) Claims History destination ends the drill-down.
    navigateTo(/claims history/i)
    expect(await screen.findByRole('table')).toBeDefined()
  })

  it('keeps the other navigation destinations reachable', async () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { level: 1, name: /^dashboard$/i }),
    ).toBeDefined()

    navigateTo(/claim lookup/i)
    expect(
      await screen.findByRole('heading', { level: 1, name: /^claim lookup$/i }),
    ).toBeDefined()

    navigateTo(/new claim analysis/i)
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /^new claim analysis$/i,
      }),
    ).toBeDefined()

    navigateTo(/claims history/i)
    expect(
      await screen.findByRole('heading', { level: 1, name: /^claims history$/i }),
    ).toBeDefined()
  })

  it('opens a saved analysis from the dashboard recent activity', async () => {
    mockedDashboard.mockResolvedValueOnce({
      ...emptyDashboard(),
      totals: { claims: 1, analyses: 1, reviews: 0 },
      analyses_awaiting_review: 1,
      recent_analyses: [recentAnalysis({ analysis_id: 'AN-9' })],
    })
    mockedAnalysis.mockResolvedValueOnce(savedAnalysis('AN-9'))
    render(<App />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: /view details for analysis AN-9/i,
      }),
    )

    // The dashboard action opens the saved analysis details inside Claims
    // History, passing the row's exact analysis id.
    expect(
      await screen.findByRole('heading', { level: 1, name: /^saved analysis$/i }),
    ).toBeDefined()
    expect(await screen.findByText('Analysis ID: AN-9')).toBeDefined()
    expect(mockedAnalysis).toHaveBeenCalledWith('AN-9')
  })
})
