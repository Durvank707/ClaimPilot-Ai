import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SavedAnalysisDetailsPage } from './SavedAnalysisDetailsPage'
import { getAnalysisById, type SavedAnalysis } from '../api/retrieval'
import { ApiError } from '../api/errors'

// Mock the retrieval API function itself so no backend is required.
vi.mock('../api/retrieval', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/retrieval')>()
  return { ...actual, getAnalysisById: vi.fn() }
})

const mockedGetAnalysisById = vi.mocked(getAnalysisById)

/**
 * A saved analysis matching the real `AnalysisDB` contract, including the
 * nested explanation and decision payloads the backend actually persists.
 */
function saved(overrides: Partial<SavedAnalysis> = {}): SavedAnalysis {
  return {
    analysis_id: 'AN-1',
    claim_id: 'CLM-1',
    analyzed_at: '2024-05-01T10:00:00',
    fraud: { probability: 0.375 },
    severity: { predicted_claim_amount: 18500 },
    anomaly: { score: -0.047 },
    risk: {
      score: 31.2,
      level: 'MEDIUM',
      components: { fraud: 37.5, anomaly: -4.7, severity: 54.39 },
    },
    explanation: {
      fraud: { probability: 0.375 },
      anomaly: { score: -0.047 },
      severity: { predicted_amount: 18500 },
      risk: {
        score: 31.2,
        level: 'MEDIUM',
        components: { fraud: 37.5, anomaly: -4.7, severity: 54.39 },
        summary:
          'Risk score combines fraud, anomaly, and severity signals for prioritization.',
      },
    },
    decision: {
      recommendation: 'ENHANCED_REVIEW',
      priority: 'MEDIUM',
      risk_score: 31.2,
      risk_level: 'MEDIUM',
      reasons: ['Overall risk score is 31.2 (MEDIUM).'],
      suggested_actions: ['Perform additional claim verification.'],
      triggered_rules: [],
      policy_version: '1.0',
      human_decision_required: true,
    },
    ...overrides,
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

/** A saved analysis whose model signals were not stored (all null). */
function savedWithoutSignals(): SavedAnalysis {
  return saved({
    fraud: { probability: null },
    severity: { predicted_claim_amount: null },
    anomaly: { score: null },
    explanation: {
      fraud: { probability: null },
      anomaly: { score: null },
      severity: { predicted_amount: null },
      risk: {
        summary:
          'Risk score combines fraud, anomaly, and severity signals for prioritization.',
      },
    },
  })
}

function renderPage(
  analysisId: string | null = 'AN-1',
  onBack?: () => void,
) {
  return render(
    <SavedAnalysisDetailsPage analysisId={analysisId} onBack={onBack} />,
  )
}

beforeEach(() => {
  mockedGetAnalysisById.mockReset()
})

describe('SavedAnalysisDetailsPage', () => {
  it('does not request anything for a null analysis ID', () => {
    renderPage(null)
    expect(screen.getByText('No saved analysis selected')).toBeDefined()
    expect(mockedGetAnalysisById).not.toHaveBeenCalled()
  })

  it('treats a blank or whitespace-only analysis ID as missing', () => {
    renderPage('')
    expect(screen.getByText('No saved analysis selected')).toBeDefined()

    render(<SavedAnalysisDetailsPage analysisId="   " />)
    expect(screen.getAllByText('No saved analysis selected').length).toBeGreaterThan(
      0,
    )

    expect(mockedGetAnalysisById).not.toHaveBeenCalled()
  })

  it('shows an accessible loading state and requests the analysis', async () => {
    const pending = deferred<SavedAnalysis>()
    mockedGetAnalysisById.mockImplementationOnce(() => pending.promise)
    renderPage('AN-1')

    expect(await screen.findByText('Loading saved analysis…')).toBeDefined()
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
    expect(mockedGetAnalysisById).toHaveBeenCalledWith('AN-1')

    pending.resolve(saved())
    expect(await screen.findByText('Analysis summary')).toBeDefined()
  })

  it('renders the saved analysis summary', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved())
    renderPage('AN-1')

    expect(await screen.findByText('Analysis summary')).toBeDefined()
    expect(screen.getByText('AN-1')).toBeDefined()
    expect(screen.getByText('CLM-1')).toBeDefined()
    expect(screen.getByText('May 1, 2024, 10:00 AM')).toBeDefined()
    expect(screen.getAllByText('31.2').length).toBeGreaterThan(0)
    expect(screen.getAllByText('MEDIUM').length).toBeGreaterThan(0)
  })

  it('distinguishes the overall risk score from the fraud probability', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved())
    renderPage('AN-1')

    await screen.findByText('Analysis summary')
    expect(
      screen.getByText(/0–100 prioritisation measure, not a probability of fraud/i),
    ).toBeDefined()
  })

  it('formats the fraud probability and describes it as a model estimate', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved())
    renderPage('AN-1')

    await screen.findByText('Analysis summary')
    expect(screen.getAllByText('37.5%').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/not proof of fraud/i).length).toBeGreaterThan(0)
  })

  it('shows "Not available" for a null fraud probability', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(savedWithoutSignals())
    renderPage('AN-1')

    await screen.findByText('Analysis summary')
    expect(screen.queryByText('37.5%')).toBeNull()
    expect(screen.getAllByText('Not available').length).toBeGreaterThan(0)
  })

  it('formats the predicted claim amount as a model estimate', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved())
    renderPage('AN-1')

    await screen.findByText('Analysis summary')
    expect(screen.getAllByText('$18,500.00').length).toBeGreaterThan(0)
    expect(
      screen.getByText(/not the final approved or payable amount/i),
    ).toBeDefined()
  })

  it('shows "Not available" for a null predicted claim amount', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(savedWithoutSignals())
    renderPage('AN-1')

    await screen.findByText('Analysis summary')
    expect(screen.queryByText('$18,500.00')).toBeNull()
    expect(screen.getAllByText('Not available').length).toBeGreaterThan(0)
  })

  it('shows the anomaly score without labelling it a fraud probability', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved())
    renderPage('AN-1')

    await screen.findByText('Analysis summary')
    expect(screen.getAllByText('-0.047').length).toBeGreaterThan(0)
    expect(screen.getByText(/appears to the anomaly detector/i)).toBeDefined()
    expect(screen.getByText(/score is unbounded/i)).toBeDefined()
  })

  it('shows "Not available" for a null anomaly score', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(savedWithoutSignals())
    renderPage('AN-1')

    await screen.findByText('Analysis summary')
    expect(screen.queryByText('-0.047')).toBeNull()
  })

  it('shows the stored risk components', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved())
    renderPage('AN-1')

    await screen.findByText('Risk breakdown')
    expect(screen.getByText('37.5 of 100')).toBeDefined()
    expect(screen.getByText('54.4 percentile')).toBeDefined()
    expect(screen.getByText(/Unbounded component/i)).toBeDefined()
  })

  it('shows an empty state when no risk components were saved', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(
      saved({ risk: { score: 31.2, level: 'MEDIUM', components: null } }),
    )
    renderPage('AN-1')

    await screen.findByText('Risk breakdown')
    expect(
      screen.getByText('No risk component breakdown was saved for this analysis.'),
    ).toBeDefined()
  })

  it('shows the same empty state for empty risk components', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(
      saved({ risk: { score: 31.2, level: 'MEDIUM', components: {} } }),
    )
    renderPage('AN-1')

    await screen.findByText('Risk breakdown')
    expect(
      screen.getByText('No risk component breakdown was saved for this analysis.'),
    ).toBeDefined()
  })

  it('renders the saved explanation payload', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved())
    renderPage('AN-1')

    await screen.findByText('Explanation')
    expect(
      screen.getByText(/Risk score combines fraud, anomaly, and severity signals/i),
    ).toBeDefined()
    expect(
      screen.getByText(/No feature-level contributions or rule-based reasons/i),
    ).toBeDefined()
  })

  it('shows an empty state for a null explanation', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved({ explanation: null }))
    renderPage('AN-1')

    await screen.findByText('Explanation')
    expect(
      screen.getByText('No saved explanation is available for this analysis.'),
    ).toBeDefined()
  })

  it('shows an empty state for an empty explanation', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved({ explanation: {} }))
    renderPage('AN-1')

    await screen.findByText('Explanation')
    expect(
      screen.getByText('No saved explanation is available for this analysis.'),
    ).toBeDefined()
  })

  it('renders the saved review recommendation and optional lists', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved())
    renderPage('AN-1')

    await screen.findByText('Review recommendation')
    expect(screen.getAllByText('ENHANCED_REVIEW').length).toBeGreaterThan(0)
    expect(screen.getByText('Overall risk score is 31.2 (MEDIUM).')).toBeDefined()
    expect(
      screen.getByText('Perform additional claim verification.'),
    ).toBeDefined()
    expect(screen.getByText('No rules were triggered.')).toBeDefined()
    expect(screen.getByText('1.0')).toBeDefined()
  })

  it('makes the human-review requirement explicit', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved())
    renderPage('AN-1')

    await screen.findByText('Human decision required')
    expect(
      screen.getByText(/requires a human claims officer decision/i),
    ).toBeDefined()
  })

  it('does not claim an automatic decision when human review is not required', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(
      saved({
        decision: {
          recommendation: 'ROUTINE_REVIEW',
          priority: 'LOW',
          human_decision_required: false,
        },
      }),
    )
    renderPage('AN-1')

    await screen.findByText('Review recommendation')
    expect(
      screen.getByText(/recommendation is still not an automatic decision/i),
    ).toBeDefined()
    expect(screen.queryByText('Human decision required')).toBeNull()
  })

  it('shows an empty state when the decision payload is null', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved({ decision: null }))
    renderPage('AN-1')

    await screen.findByText('Review recommendation')
    expect(
      screen.getByText(
        'No saved review recommendation is available for this analysis.',
      ),
    ).toBeDefined()
  })

  it('shows an empty state when the decision payload is empty', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved({ decision: {} }))
    renderPage('AN-1')

    await screen.findByText('Review recommendation')
    expect(
      screen.getByText(
        'No saved review recommendation is available for this analysis.',
      ),
    ).toBeDefined()
  })

  it('shows a distinct not-found state for a 404', async () => {
    mockedGetAnalysisById.mockRejectedValueOnce(
      new ApiError('http', 'not found', { status: 404 }),
    )
    renderPage('AN-1')

    expect(await screen.findByText('No saved analysis found')).toBeDefined()
    expect(screen.queryByText('Analysis summary')).toBeNull()
  })

  it('shows a network error state when the backend is unreachable', async () => {
    mockedGetAnalysisById.mockRejectedValueOnce(
      new ApiError('network', 'offline'),
    )
    renderPage('AN-1')

    expect(
      await screen.findByText('The backend could not be reached'),
    ).toBeDefined()
    expect(
      screen.getAllByText(/check the connection and try again/i).length,
    ).toBeGreaterThan(0)
  })

  it('shows a safe server error state for HTTP failures', async () => {
    mockedGetAnalysisById.mockRejectedValueOnce(
      new ApiError('http', 'server error', { status: 500 }),
    )
    renderPage('AN-1')

    expect(
      await screen.findByText('The saved analysis could not be loaded'),
    ).toBeDefined()
    expect(
      screen.getAllByText('The backend returned an error (HTTP 500).').length,
    ).toBeGreaterThan(0)
  })

  it('shows an unexpected-response state for a malformed payload', async () => {
    mockedGetAnalysisById.mockRejectedValueOnce(
      new ApiError('parse', 'bad shape'),
    )
    renderPage('AN-1')

    expect(await screen.findByText('Unexpected response')).toBeDefined()
    expect(
      screen.getAllByText('The backend returned an unexpected response.').length,
    ).toBeGreaterThan(0)
  })

  it('does not let an older request overwrite a newer analysis', async () => {
    const slow = deferred<SavedAnalysis>()
    mockedGetAnalysisById
      .mockImplementationOnce(() => slow.promise)
      .mockResolvedValueOnce(saved({ analysis_id: 'B-2', claim_id: 'CLM-B' }))

    const { rerender } = render(
      <SavedAnalysisDetailsPage analysisId="A-1" />,
    )
    expect(await screen.findByText('Loading saved analysis…')).toBeDefined()

    // Switch to a newer analysis while the first request is still pending.
    rerender(<SavedAnalysisDetailsPage analysisId="B-2" />)
    expect(await screen.findByText('Analysis ID: B-2')).toBeDefined()
    expect(mockedGetAnalysisById).toHaveBeenCalledTimes(2)

    // The older request now resolves; it must be ignored.
    slow.resolve(saved({ analysis_id: 'A-1', claim_id: 'CLM-A' }))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(screen.getByText('Analysis ID: B-2')).toBeDefined()
    expect(screen.queryByText('Analysis ID: A-1')).toBeNull()
  })

  it('offers a back action when a handler is provided', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved())
    const onBack = vi.fn()
    renderPage('AN-1', onBack)

    await screen.findByText('Analysis summary')
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('omits the back action when no handler is provided', () => {
    renderPage(null)
    expect(screen.queryByRole('button', { name: /back/i })).toBeNull()
  })

  it('retries the same analysis on request without auto-retrying', async () => {
    mockedGetAnalysisById
      .mockRejectedValueOnce(new ApiError('network', 'offline'))
      .mockResolvedValueOnce(saved())
    renderPage('AN-1')

    expect(
      await screen.findByText('The backend could not be reached'),
    ).toBeDefined()
    expect(mockedGetAnalysisById).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('Analysis summary')).toBeDefined()
    expect(mockedGetAnalysisById).toHaveBeenCalledTimes(2)
    expect(mockedGetAnalysisById).toHaveBeenLastCalledWith('AN-1')
  })
})
