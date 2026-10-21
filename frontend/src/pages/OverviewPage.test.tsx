import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { OverviewPage } from './OverviewPage'
import {
  getDashboardSummary,
  getReviewQueue,
  type DashboardRecentAnalysis,
  type DashboardRecentReview,
  type DashboardReviewQueueItem,
  type DashboardReviewQueuePage,
  type DashboardSummary,
} from '../api/dashboard'
import { ApiError } from '../api/errors'

// Mock the dashboard API module so no backend is required.
vi.mock('../api/dashboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/dashboard')>()
  return {
    ...actual,
    getDashboardSummary: vi.fn(),
    getReviewQueue: vi.fn(),
  }
})

const mockedSummary = vi.mocked(getDashboardSummary)
const mockedQueue = vi.mocked(getReviewQueue)

function recent(
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

function recentReview(
  overrides: Partial<DashboardRecentReview> = {},
): DashboardRecentReview {
  return {
    review_id: 'REV-1',
    final_decision: 'APPROVED',
    reviewer_id: 'OFFICER-1',
    reviewed_at: '2024-05-03T09:30:00',
    analysis_id: 'AN-1',
    claim_id: 'CLM-1',
    risk_level: 'MEDIUM',
    ...overrides,
  }
}

function queueItem(
  overrides: Partial<DashboardReviewQueueItem> = {},
): DashboardReviewQueueItem {
  return {
    analysis_id: 'QA-1',
    claim_id: 'QCLM-1',
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
    ...overrides,
  }
}

function queuePage(
  overrides: Partial<DashboardReviewQueuePage> = {},
): DashboardReviewQueuePage {
  return {
    items: [queueItem()],
    total: 1,
    limit: 10,
    offset: 0,
    ...overrides,
  }
}

const ZERO_STATUS_ROW = { total: 0, awaiting_review: 0, reviewed: 0 }

function summary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
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
    recent_analyses: [recent()],
    risk_review_status: {
      LOW: { total: 1, awaiting_review: 0, reviewed: 1 },
      MEDIUM: { total: 1, awaiting_review: 1, reviewed: 0 },
      HIGH: { total: 1, awaiting_review: 1, reviewed: 0 },
      CRITICAL: { ...ZERO_STATUS_ROW },
      UNKNOWN: { ...ZERO_STATUS_ROW },
    },
    recent_reviews: [recentReview()],
    oldest_awaiting_analyzed_at: '2024-05-02T09:30:00',
    ...overrides,
  }
}

function emptySummary(): DashboardSummary {
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
      LOW: { ...ZERO_STATUS_ROW },
      MEDIUM: { ...ZERO_STATUS_ROW },
      HIGH: { ...ZERO_STATUS_ROW },
      CRITICAL: { ...ZERO_STATUS_ROW },
      UNKNOWN: { ...ZERO_STATUS_ROW },
    },
    recent_reviews: [],
    oldest_awaiting_analyzed_at: null,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  mockedSummary.mockReset()
  mockedSummary.mockResolvedValue(emptySummary())
  mockedQueue.mockReset()
  mockedQueue.mockResolvedValue(queuePage({ items: [], total: 0 }))
})

describe('OverviewPage loading and errors', () => {
  it('shows a loading state before the summary resolves', () => {
    const pending = deferred<DashboardSummary>()
    mockedSummary.mockImplementationOnce(() => pending.promise)

    render(<OverviewPage />)

    expect(screen.getByText(/loading dashboard/i)).toBeDefined()
    expect(screen.getByRole('heading', { level: 1, name: /^dashboard$/i })).toBeDefined()

    // Resolve to avoid an unhandled-update warning after the assertion.
    pending.resolve(emptySummary())
  })

  it('shows a distinct network error and retries on demand', async () => {
    mockedSummary.mockReset()
    mockedSummary.mockRejectedValueOnce(new ApiError('network', 'offline'))
    mockedSummary.mockResolvedValueOnce(summary())

    render(<OverviewPage />)

    expect(
      await screen.findByText(/the backend could not be reached/i),
    ).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: /try again/i }))

    expect(
      await screen.findByRole('heading', { name: /risk distribution/i }),
    ).toBeDefined()
    expect(mockedSummary).toHaveBeenCalledTimes(2)
  })

  it('shows a 404 as a distinct dashboard-unavailable error', async () => {
    mockedSummary.mockReset()
    mockedSummary.mockRejectedValueOnce(
      new ApiError('http', 'missing', { status: 404 }),
    )

    render(<OverviewPage />)

    expect(await screen.findByText(/dashboard unavailable/i)).toBeDefined()
    expect(screen.queryByText(/could not be reached/i)).toBeNull()
  })

  it('never renders fabricated figures when the request fails', async () => {
    mockedSummary.mockReset()
    mockedSummary.mockRejectedValueOnce(new ApiError('http', 'boom', { status: 500 }))

    render(<OverviewPage />)

    expect(await screen.findByRole('alert')).toBeDefined()
    expect(screen.queryByText('142')).toBeNull()
    expect(screen.queryByRole('heading', { name: /risk distribution/i })).toBeNull()
  })
})

describe('OverviewPage with persisted data', () => {
  it('renders the real metric values, labelled so records are not conflated', async () => {
    mockedSummary.mockResolvedValue(summary())
    render(<OverviewPage />)

    expect(await screen.findByText('Analyses')).toBeDefined()
    expect(
      screen.getByText(/persisted analysis records \(not unique claims\)/i),
    ).toBeDefined()
    expect(screen.getByText(/distinct persisted claim records/i)).toBeDefined()
    expect(screen.getByText(/stored reviews \(an analysis may have more than one\)/i)).toBeDefined()

    // The four "Analysis"/"Claim" tiles carry their exact persisted values.
    const analysesTile = screen.getByText('Analyses').closest('div')
    expect(analysesTile?.parentElement?.textContent).toContain('3')
  })

  it('renders the risk distribution as labelled bars, hiding an empty UNKNOWN', async () => {
    mockedSummary.mockResolvedValue(summary())
    render(<OverviewPage />)

    expect(
      await screen.findByRole('img', { name: /HIGH risk: 1 of 3 analyses/i }),
    ).toBeDefined()
    expect(
      screen.getByRole('img', { name: /LOW risk: 1 of 3 analyses/i }),
    ).toBeDefined()
    expect(screen.queryByRole('img', { name: /UNKNOWN risk/i })).toBeNull()
  })

  it('shows an UNKNOWN bucket only when unrecognised levels exist', async () => {
    mockedSummary.mockResolvedValue(
      summary({
        risk_distribution: { LOW: 1, MEDIUM: 0, HIGH: 0, CRITICAL: 0, UNKNOWN: 2 },
      }),
    )
    render(<OverviewPage />)

    expect(
      await screen.findByRole('img', { name: /UNKNOWN risk: 2 of 3 analyses/i }),
    ).toBeDefined()
  })

  it('separates review-record counts from latest-outcome-per-analysis counts', async () => {
    mockedSummary.mockResolvedValue(summary())
    render(<OverviewPage />)

    const recordsHeading = await screen.findByText('Reviews by outcome')
    const recordsBlock = recordsHeading.parentElement as HTMLElement
    const approvedRow = within(recordsBlock).getByText('Approved').closest('li')
    expect(approvedRow?.textContent).toContain('2')

    const latestHeading = screen.getByText('Latest review outcome per analysis')
    const latestBlock = latestHeading.parentElement as HTMLElement
    const latestApprovedRow = within(latestBlock)
      .getByText('Approved')
      .closest('li')
    expect(latestApprovedRow?.textContent).toContain('1')
  })

  it('reports analyses awaiting review from the persisted count', async () => {
    mockedSummary.mockResolvedValue(summary({ analyses_awaiting_review: 7 }))
    render(<OverviewPage />)

    const dt = await screen.findByText('Awaiting review')
    expect(dt.parentElement?.textContent).toContain('7')
  })

  it('renders recent activity and opens an analysis through the callback', async () => {
    mockedSummary.mockResolvedValue(
      summary({ recent_analyses: [recent({ analysis_id: 'AN-9' })] }),
    )
    const onOpenAnalysis = vi.fn()
    render(<OverviewPage onOpenAnalysis={onOpenAnalysis} />)

    expect(await screen.findByText('Recent activity')).toBeDefined()
    fireEvent.click(
      screen.getByRole('button', { name: /view details for analysis AN-9/i }),
    )
    expect(onOpenAnalysis).toHaveBeenCalledWith('AN-9')
  })

  it('renders "Not available" for absent recent-activity values', async () => {
    mockedSummary.mockResolvedValue(
      summary({
        recent_analyses: [
          recent({
            risk_level: null,
            risk_score: null,
            recommendation: null,
            analyzed_at: null,
            fraud_probability: null,
          }),
        ],
      }),
    )
    render(<OverviewPage />)

    await screen.findByText('Recent activity')
    // risk level, analyzed, fraud probability, risk score and recommendation
    // are all absent for this row.
    expect(screen.getAllByText('Not available').length).toBeGreaterThanOrEqual(5)
  })

  it('disables the details action when a row has no analysis id', async () => {
    mockedSummary.mockResolvedValue(
      summary({ recent_analyses: [recent({ analysis_id: null })] }),
    )
    const onOpenAnalysis = vi.fn()
    render(<OverviewPage onOpenAnalysis={onOpenAnalysis} />)

    const button = await screen.findByRole('button', {
      name: /view details unavailable/i,
    })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(button)
    expect(onOpenAnalysis).not.toHaveBeenCalled()
  })
})

describe('OverviewPage with an empty database', () => {
  it('keeps the dashboard usable and honest when there are no analyses', async () => {
    mockedSummary.mockResolvedValue(emptySummary())
    render(<OverviewPage />)

    expect(await screen.findByText(/no persisted analyses yet/i)).toBeDefined()
    expect(screen.getByText(/no analyses to summarise/i)).toBeDefined()
    expect(screen.getByText(/no activity yet/i)).toBeDefined()
    expect(screen.getAllByText(/no reviews have been recorded yet/i)).toHaveLength(2)

    // Zeroed metrics are shown rather than invented values.
    expect(screen.getByText('Awaiting review')).toBeDefined()
    expect(mockedSummary).toHaveBeenCalledTimes(1)
  })
})

describe('OverviewPage with partial data', () => {
  it('treats analyses without reviews as awaiting review and shows empty review lists', async () => {
    mockedSummary.mockResolvedValue(
      summary({
        totals: { claims: 1, analyses: 2, reviews: 0 },
        high_critical_analyses: 0,
        analyses_with_reviews: 0,
        analyses_awaiting_review: 2,
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
        recent_reviews: [],
      }),
    )
    render(<OverviewPage />)

    expect(await screen.findByText('Analyses reviewed')).toBeDefined()
    const dt = screen.getByText('Awaiting review')
    expect(dt.parentElement?.textContent).toContain('2')
    await waitFor(() =>
      expect(
        screen.getAllByText(/no reviews have been recorded yet/i),
      ).toHaveLength(2),
    )
  })
})

describe('OverviewPage review insights', () => {
  it('shows per-bucket reviewed/awaiting counts without renaming the bars', async () => {
    mockedSummary.mockResolvedValue(summary())
    render(<OverviewPage />)

    expect(
      await screen.findByRole('img', { name: /HIGH risk: 1 of 3 analyses/i }),
    ).toBeDefined()
    // MEDIUM and HIGH each have exactly one awaiting, unreviewed analysis.
    expect(
      screen.getAllByText(/1 awaiting review · 0 analyses reviewed/i),
    ).toHaveLength(2)
    expect(
      screen.getByText(/0 awaiting review · 1 analysis reviewed/i),
    ).toBeDefined()
  })

  it('renders recent review records with nullable reviewer ids preserved', async () => {
    mockedSummary.mockResolvedValue(
      summary({
        recent_reviews: [
          recentReview({ review_id: 'REV-2', reviewer_id: null }),
        ],
      }),
    )
    render(<OverviewPage />)

    const heading = await screen.findByText('Recent review records')
    const block = heading.parentElement as HTMLElement
    expect(within(block).getByText('Approved')).toBeDefined()
    expect(within(block).getByText(/reviewer: not available/i)).toBeDefined()
    expect(within(block).getByText(/analysis AN-1 · claim CLM-1/i)).toBeDefined()
  })

  it('labels the recent review list as records, not unique analyses', async () => {
    mockedSummary.mockResolvedValue(summary())
    render(<OverviewPage />)

    expect(
      await screen.findByText(/these are records, not unique reviewed analyses/i),
    ).toBeDefined()
  })

  it('shows the oldest waiting age without implying an SLA', async () => {
    mockedSummary.mockResolvedValue(summary())
    render(<OverviewPage />)

    expect(
      await screen.findByText(/waiting age is measured from the analysis timestamp/i),
    ).toBeDefined()
    expect(screen.getByText(/oldest waiting analysis:/i)).toBeDefined()
  })

  it('handles an absent waiting timestamp gracefully', async () => {
    mockedSummary.mockResolvedValue(
      summary({ oldest_awaiting_analyzed_at: null }),
    )
    render(<OverviewPage />)

    expect(
      await screen.findByText(/no analyses are currently waiting for review/i),
    ).toBeDefined()
  })
})

describe('OverviewPage review queue', () => {
  it('renders populated queue rows with review-record context', async () => {
    mockedSummary.mockResolvedValue(summary())
    mockedQueue.mockResolvedValue(
      queuePage({
        items: [
          queueItem({
            analysis_id: 'QA-9',
            review_count: 2,
            latest_review_outcome: 'ESCALATED',
          }),
        ],
      }),
    )
    render(<OverviewPage />)

    expect(await screen.findByText('Review worklist')).toBeDefined()
    expect(screen.getByText('QA-9')).toBeDefined()
    expect(screen.getByText(/2 reviews · latest escalated/i)).toBeDefined()
    expect(screen.getByText(/showing 1–1 of 1 analysis/i)).toBeDefined()
  })

  it('shows an honest empty state when nothing is awaiting review', async () => {
    mockedSummary.mockResolvedValue(summary())
    mockedQueue.mockResolvedValue(queuePage({ items: [], total: 0 }))
    render(<OverviewPage />)

    expect(await screen.findByText('Nothing awaiting review')).toBeDefined()
  })

  it('shows a retryable error and reloads on demand', async () => {
    mockedSummary.mockResolvedValue(summary())
    mockedQueue.mockReset()
    mockedQueue.mockRejectedValueOnce(new ApiError('network', 'offline'))
    mockedQueue.mockResolvedValueOnce(queuePage({ items: [queueItem()] }))
    render(<OverviewPage />)

    expect(await screen.findByText('The backend could not be reached')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByText('QA-1')).toBeDefined()
    expect(mockedQueue).toHaveBeenCalledTimes(2)
  })

  it('refetches from offset zero when the risk filter changes', async () => {
    mockedSummary.mockResolvedValue(summary())
    mockedQueue.mockResolvedValue(queuePage())
    render(<OverviewPage />)

    const select = await screen.findByLabelText(/filter the review queue by risk level/i)
    fireEvent.change(select, { target: { value: 'HIGH' } })

    await waitFor(() =>
      expect(mockedQueue).toHaveBeenLastCalledWith(
        expect.objectContaining({ riskLevel: 'HIGH', offset: 0 }),
      ),
    )
  })

  it('pages forward and backward using the queue offset', async () => {
    mockedSummary.mockResolvedValue(summary())
    mockedQueue.mockResolvedValue(
      queuePage({ items: [queueItem()], total: 25, offset: 0 }),
    )
    render(<OverviewPage />)

    fireEvent.click(await screen.findByRole('button', { name: /^next$/i }))
    await waitFor(() =>
      expect(mockedQueue).toHaveBeenLastCalledWith(
        expect.objectContaining({ offset: 10 }),
      ),
    )
  })

  it('disables paging at the boundaries', async () => {
    mockedSummary.mockResolvedValue(summary())
    mockedQueue.mockResolvedValue(
      queuePage({ items: [queueItem()], total: 1, offset: 0 }),
    )
    render(<OverviewPage />)

    const previous = await screen.findByRole('button', { name: /^previous$/i })
    const next = screen.getByRole('button', { name: /^next$/i })
    expect((previous as HTMLButtonElement).disabled).toBe(true)
    expect((next as HTMLButtonElement).disabled).toBe(true)
  })

  it('opens the saved analysis details from a queue row', async () => {
    mockedSummary.mockResolvedValue(summary())
    mockedQueue.mockResolvedValue(
      queuePage({ items: [queueItem({ analysis_id: 'QA-42' })] }),
    )
    const onOpenAnalysis = vi.fn()
    render(<OverviewPage onOpenAnalysis={onOpenAnalysis} />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: /view details for analysis QA-42/i,
      }),
    )
    expect(onOpenAnalysis).toHaveBeenCalledWith('QA-42')
  })

  it('renders an absent risk score and timestamp without inventing values', async () => {
    mockedSummary.mockResolvedValue(summary())
    mockedQueue.mockResolvedValue(
      queuePage({
        items: [
          queueItem({
            risk_score: null,
            risk_level: null,
            analyzed_at: null,
            incident_type: null,
            claim_amount: null,
          }),
        ],
      }),
    )
    render(<OverviewPage />)

    await screen.findByText('QA-1')
    expect(screen.getAllByText('Not available').length).toBeGreaterThanOrEqual(3)
  })
})
