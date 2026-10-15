import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ClaimsHistoryPage } from './ClaimsHistoryPage'
import {
  getAnalysisById,
  getClaimAnalysisHistory,
  type AnalysisHistoryItem,
  type AnalysisHistoryPage,
  type SavedAnalysis,
} from '../api/retrieval'
import { ApiError } from '../api/errors'

// Mock the retrieval API functions themselves so no backend is required.
vi.mock('../api/retrieval', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/retrieval')>()
  return {
    ...actual,
    getClaimAnalysisHistory: vi.fn(),
    getAnalysisById: vi.fn(),
  }
})

const mockedGetClaimAnalysisHistory = vi.mocked(getClaimAnalysisHistory)
const mockedGetAnalysisById = vi.mocked(getAnalysisById)

function item(
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

function page(
  overrides: Partial<AnalysisHistoryPage> = {},
): AnalysisHistoryPage {
  return { items: [item()], total: 1, limit: 20, offset: 0, ...overrides }
}

function pageWith(
  analysisId: string,
  overrides: Partial<AnalysisHistoryPage> = {},
): AnalysisHistoryPage {
  return page({ items: [item({ analysis_id: analysisId })], ...overrides })
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

/** A saved analysis matching the real retrieval contract. */
function saved(analysisId: string): SavedAnalysis {
  return {
    analysis_id: analysisId,
    claim_id: 'CLM-1',
    analyzed_at: '2024-05-01T10:00:00',
    fraud: { probability: 0.375 },
    severity: { predicted_claim_amount: 18500 },
    anomaly: { score: -0.047 },
    risk: { score: 31.2, level: 'MEDIUM', components: null },
    explanation: null,
    decision: null,
  }
}

function renderPage() {
  return render(<ClaimsHistoryPage />)
}

function input() {
  return screen.getByLabelText(/Claim ID/) as HTMLInputElement
}

function form() {
  return screen.getByRole('form', { name: /claims history form/i })
}

function searchButton() {
  return screen.getByRole('button', { name: /^search$/i })
}

function navButton(name: RegExp) {
  return screen.getByRole('button', { name }) as HTMLButtonElement
}

async function typeAndSearch(value: string) {
  fireEvent.change(input(), { target: { value } })
  fireEvent.click(searchButton())
}

beforeEach(() => {
  mockedGetClaimAnalysisHistory.mockReset()
  mockedGetAnalysisById.mockReset()
})

describe('ClaimsHistoryPage', () => {
  it('renders an accessible claim ID field in the initial state', () => {
    renderPage()

    expect(screen.getByLabelText(/Claim ID/)).toBeDefined()
    expect(searchButton()).toBeDefined()
    expect(screen.getByText('No claim selected')).toBeDefined()
    expect(mockedGetClaimAnalysisHistory).not.toHaveBeenCalled()
  })

  it('rejects empty and whitespace-only input without calling the API', () => {
    renderPage()

    fireEvent.click(searchButton())
    expect(
      screen.getAllByText('Enter a claim ID to search.').length,
    ).toBeGreaterThan(0)
    expect(input().getAttribute('aria-invalid')).toBe('true')

    fireEvent.change(input(), { target: { value: '   ' } })
    fireEvent.click(searchButton())
    expect(
      screen.getAllByText('Enter a claim ID to search.').length,
    ).toBeGreaterThan(0)

    expect(mockedGetClaimAnalysisHistory).not.toHaveBeenCalled()
  })

  it('retrieves a history page and renders the summary fields', async () => {
    mockedGetClaimAnalysisHistory.mockResolvedValueOnce(page())
    renderPage()

    await typeAndSearch('CLM-1')

    expect(await screen.findByRole('table')).toBeDefined()
    expect(screen.getByText('AN-1')).toBeDefined()
    expect(screen.getByText('May 1, 2024, 10:00 AM')).toBeDefined()
    expect(screen.getByText('37.5%')).toBeDefined()
    expect(screen.getByText('$18,500.00')).toBeDefined()
    expect(screen.getByText('-0.047')).toBeDefined()
    expect(screen.getByText('31.2')).toBeDefined()
    expect(screen.getByText('MEDIUM')).toBeDefined()
    expect(screen.getByText('ENHANCED_REVIEW')).toBeDefined()
    expect(mockedGetClaimAnalysisHistory).toHaveBeenCalledWith('CLM-1', {
      limit: 20,
      offset: 0,
      order: 'desc',
    })
  })

  it('renders null summary fields with an honest placeholder', async () => {
    mockedGetClaimAnalysisHistory.mockResolvedValueOnce(
      page({
        items: [
          item({
            analysis_id: 'AN-2',
            analyzed_at: null,
            fraud_probability: null,
            predicted_claim_amount: null,
            anomaly_score: null,
            risk_score: null,
            risk_level: null,
            recommendation: null,
          }),
        ],
      }),
    )
    renderPage()

    await typeAndSearch('CLM-1')
    await screen.findByRole('table')

    // Seven nullable summary fields are missing; the analysis id is present.
    expect(screen.getAllByText('Not available')).toHaveLength(7)
  })

  it('trims whitespace from the submitted claim ID', async () => {
    mockedGetClaimAnalysisHistory.mockResolvedValueOnce(page())
    renderPage()

    await typeAndSearch('  CLM-1  ')
    await screen.findByRole('table')

    expect(mockedGetClaimAnalysisHistory).toHaveBeenCalledWith('CLM-1', {
      limit: 20,
      offset: 0,
      order: 'desc',
    })
  })

  it('supports submitting the form with Enter', async () => {
    mockedGetClaimAnalysisHistory.mockResolvedValueOnce(page())
    renderPage()

    fireEvent.change(input(), { target: { value: 'CLM-1' } })
    fireEvent.submit(form())

    expect(await screen.findByRole('table')).toBeDefined()
    expect(mockedGetClaimAnalysisHistory).toHaveBeenCalledWith('CLM-1', {
      limit: 20,
      offset: 0,
      order: 'desc',
    })
  })

  it('shows a loading state and prevents duplicate requests', async () => {
    const pending = deferred<AnalysisHistoryPage>()
    mockedGetClaimAnalysisHistory.mockImplementationOnce(() => pending.promise)
    renderPage()

    await typeAndSearch('CLM-1')

    expect(await screen.findByText('Loading claim history…')).toBeDefined()
    const busyButton = screen.getByRole('button', { name: /searching/i })
    expect((busyButton as HTMLButtonElement).disabled).toBe(true)

    // Neither a second click nor a repeated submit starts another request.
    fireEvent.click(busyButton)
    fireEvent.submit(form())
    expect(mockedGetClaimAnalysisHistory).toHaveBeenCalledTimes(1)

    pending.resolve(page())
    expect(await screen.findByRole('table')).toBeDefined()
    expect(mockedGetClaimAnalysisHistory).toHaveBeenCalledTimes(1)
  })

  it('shows an empty state when the claim has no analyses', async () => {
    mockedGetClaimAnalysisHistory.mockResolvedValueOnce(
      page({ items: [], total: 0 }),
    )
    renderPage()

    await typeAndSearch('CLM-1')

    expect(await screen.findByText('No saved analyses yet')).toBeDefined()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('shows a not-found state for a 404', async () => {
    mockedGetClaimAnalysisHistory.mockRejectedValueOnce(
      new ApiError('http', 'not found', { status: 404 }),
    )
    renderPage()

    await typeAndSearch('MISSING')

    expect(await screen.findByText('No saved claim found')).toBeDefined()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('shows a network error state when the backend is unreachable', async () => {
    mockedGetClaimAnalysisHistory.mockRejectedValueOnce(
      new ApiError('network', 'offline'),
    )
    renderPage()

    await typeAndSearch('CLM-1')

    expect(
      await screen.findByText('The backend could not be reached'),
    ).toBeDefined()
    expect(
      screen.getAllByText(/check the connection and try again/i).length,
    ).toBeGreaterThan(0)
  })

  it('shows a safe server error state for HTTP failures', async () => {
    mockedGetClaimAnalysisHistory.mockRejectedValueOnce(
      new ApiError('http', 'server error', { status: 500 }),
    )
    renderPage()

    await typeAndSearch('CLM-1')

    expect(
      await screen.findByText('The claim history could not be loaded'),
    ).toBeDefined()
    expect(
      screen.getAllByText('The backend returned an error (HTTP 500).').length,
    ).toBeGreaterThan(0)
  })

  it('paginates with Previous and Next using the backend contract', async () => {
    mockedGetClaimAnalysisHistory
      .mockResolvedValueOnce(
        pageWith('P1', { total: 42, limit: 20, offset: 0 }),
      )
      .mockResolvedValueOnce(
        pageWith('P2', { total: 42, limit: 20, offset: 20 }),
      )
      .mockResolvedValueOnce(
        pageWith('P1B', { total: 42, limit: 20, offset: 0 }),
      )
    renderPage()

    await typeAndSearch('CLM-1')
    await screen.findByText('P1')

    fireEvent.click(navButton(/next/i))
    await screen.findByText('P2')
    expect(mockedGetClaimAnalysisHistory).toHaveBeenLastCalledWith('CLM-1', {
      limit: 20,
      offset: 20,
      order: 'desc',
    })

    fireEvent.click(navButton(/previous/i))
    await screen.findByText('P1B')
    expect(mockedGetClaimAnalysisHistory).toHaveBeenLastCalledWith('CLM-1', {
      limit: 20,
      offset: 0,
      order: 'desc',
    })
  })

  it('disables Previous on the first page and Next on the last page', async () => {
    mockedGetClaimAnalysisHistory
      .mockResolvedValueOnce(
        pageWith('P1', { total: 42, limit: 20, offset: 0 }),
      )
      .mockResolvedValueOnce(
        pageWith('P2', { total: 42, limit: 20, offset: 20 }),
      )
      .mockResolvedValueOnce(
        page({
          items: [item({ analysis_id: 'P3' }), item({ analysis_id: 'P3b' })],
          total: 42,
          limit: 20,
          offset: 40,
        }),
      )
    renderPage()

    await typeAndSearch('CLM-1')
    await screen.findByText('P1')
    expect(navButton(/previous/i).disabled).toBe(true)
    expect(navButton(/next/i).disabled).toBe(false)

    fireEvent.click(navButton(/next/i))
    await screen.findByText('P2')
    expect(navButton(/previous/i).disabled).toBe(false)
    expect(navButton(/next/i).disabled).toBe(false)

    fireEvent.click(navButton(/next/i))
    await screen.findByText('P3')
    expect(navButton(/next/i).disabled).toBe(true)
    expect(navButton(/previous/i).disabled).toBe(false)
  })

  it('resets pagination to the first page when a new claim is searched', async () => {
    mockedGetClaimAnalysisHistory
      .mockResolvedValueOnce(
        pageWith('P1', { total: 42, limit: 20, offset: 0 }),
      )
      .mockResolvedValueOnce(
        pageWith('P2', { total: 42, limit: 20, offset: 20 }),
      )
      .mockResolvedValueOnce(
        pageWith('C2', { total: 1, limit: 20, offset: 0 }),
      )
    renderPage()

    await typeAndSearch('CLM-1')
    await screen.findByText('P1')

    fireEvent.click(navButton(/next/i))
    await screen.findByText('P2')

    await typeAndSearch('CLM-2')
    await screen.findByText('C2')

    expect(mockedGetClaimAnalysisHistory).toHaveBeenLastCalledWith('CLM-2', {
      limit: 20,
      offset: 0,
      order: 'desc',
    })
  })

  it('does not let an older claim request overwrite a newer result', async () => {
    const slow = deferred<AnalysisHistoryPage>()
    mockedGetClaimAnalysisHistory
      .mockImplementationOnce(() => slow.promise)
      .mockResolvedValueOnce(pageWith('RESULT-B', { total: 1 }))
    renderPage()

    await typeAndSearch('CLM-A')
    expect(await screen.findByText('Loading claim history…')).toBeDefined()

    // Start a second search while the first is still pending.
    fireEvent.change(input(), { target: { value: 'CLM-B' } })
    fireEvent.submit(form())
    await screen.findByText('RESULT-B')
    expect(mockedGetClaimAnalysisHistory).toHaveBeenCalledTimes(2)

    // The older request now resolves; it must be ignored.
    slow.resolve(pageWith('RESULT-A', { total: 1 }))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(screen.getByText('RESULT-B')).toBeDefined()
    expect(screen.queryByText('RESULT-A')).toBeNull()
  })

  it('does not let an older pagination response overwrite a newer request', async () => {
    const slowPage = deferred<AnalysisHistoryPage>()
    mockedGetClaimAnalysisHistory
      .mockResolvedValueOnce(
        pageWith('P1', { total: 42, limit: 20, offset: 0 }),
      )
      .mockImplementationOnce(() => slowPage.promise)
      .mockResolvedValueOnce(pageWith('NEWEST', { total: 1, offset: 0 }))
    renderPage()

    await typeAndSearch('CLM-1')
    await screen.findByText('P1')

    // Paginate: this request will resolve later and must be discarded.
    fireEvent.click(navButton(/next/i))
    expect(await screen.findByText('Loading claim history…')).toBeDefined()

    // A newer request (re-search) supersedes the pending pagination.
    fireEvent.submit(form())
    await screen.findByText('NEWEST')

    slowPage.resolve(pageWith('STALE', { total: 42, offset: 20 }))
    await waitFor(() =>
      expect(mockedGetClaimAnalysisHistory).toHaveBeenCalledTimes(3),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(screen.getByText('NEWEST')).toBeDefined()
    expect(screen.queryByText('STALE')).toBeNull()
  })

  it("opens a row's saved analysis using its analysis_id", async () => {
    mockedGetClaimAnalysisHistory.mockResolvedValueOnce(
      page({ items: [item({ analysis_id: 'AN-42' })] }),
    )
    const onOpenAnalysis = vi.fn()
    render(<ClaimsHistoryPage onOpenAnalysis={onOpenAnalysis} />)

    await typeAndSearch('CLM-1')
    await screen.findByRole('table')

    fireEvent.click(
      screen.getByRole('button', { name: /view details for analysis AN-42/i }),
    )

    expect(onOpenAnalysis).toHaveBeenCalledTimes(1)
    expect(onOpenAnalysis).toHaveBeenCalledWith('AN-42')
    // The claim id must never be used in place of the analysis id.
    expect(onOpenAnalysis).not.toHaveBeenCalledWith('CLM-1')
  })

  it('does not render a usable action when a row has no analysis id', async () => {
    mockedGetClaimAnalysisHistory.mockResolvedValueOnce(
      page({ items: [item({ analysis_id: null })] }),
    )
    const onOpenAnalysis = vi.fn()
    render(<ClaimsHistoryPage onOpenAnalysis={onOpenAnalysis} />)

    await typeAndSearch('CLM-1')
    await screen.findByRole('table')

    const button = screen.getByRole('button', {
      name: /view details unavailable/i,
    }) as HTMLButtonElement
    expect(button.disabled).toBe(true)

    fireEvent.click(button)
    expect(onOpenAnalysis).not.toHaveBeenCalled()
  })

  it('renders the selected saved analysis and returns via the back action', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved('AN-7'))
    const onBack = vi.fn()
    render(<ClaimsHistoryPage selectedAnalysisId="AN-7" onBack={onBack} />)

    expect(await screen.findByText('Analysis summary')).toBeDefined()
    expect(screen.getByText('Analysis ID: AN-7')).toBeDefined()
    expect(mockedGetAnalysisById).toHaveBeenCalledWith('AN-7')
    // No list request is made while showing a contextual detail.
    expect(mockedGetClaimAnalysisHistory).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /^back$/i }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('does not request a saved analysis for a blank selection', () => {
    render(<ClaimsHistoryPage selectedAnalysisId="   " />)

    expect(mockedGetAnalysisById).not.toHaveBeenCalled()
    // Falls back to the normal list view.
    expect(screen.getByText('No claim selected')).toBeDefined()
  })
})
