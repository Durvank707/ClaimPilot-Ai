import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SavedAnalysisDetailsPage } from './SavedAnalysisDetailsPage'
import { getAnalysisById, type SavedAnalysis } from '../api/retrieval'
import { createReview, getAnalysisReviews, type Review } from '../api/reviews'
import { ApiError } from '../api/errors'

// Mock the retrieval API function itself so no backend is required.
vi.mock('../api/retrieval', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/retrieval')>()
  return { ...actual, getAnalysisById: vi.fn() }
})

// Mock the reviews API functions so the human review panel needs no backend.
vi.mock('../api/reviews', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/reviews')>()
  return {
    ...actual,
    createReview: vi.fn(),
    getAnalysisReviews: vi.fn(),
  }
})

const mockedGetAnalysisById = vi.mocked(getAnalysisById)
const mockedGetAnalysisReviews = vi.mocked(getAnalysisReviews)
const mockedCreateReview = vi.mocked(createReview)

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

/** A saved human review matching the real `Review` contract. */
function review(overrides: Partial<Review> = {}): Review {
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

beforeEach(() => {
  mockedGetAnalysisById.mockReset()
  mockedGetAnalysisReviews.mockReset()
  mockedCreateReview.mockReset()
  // Default: the analysis has no reviews yet. Individual tests override this.
  mockedGetAnalysisReviews.mockResolvedValue([])
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

describe('SavedAnalysisDetailsPage — human review', () => {
  it('shows the reviews already saved for the analysis', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved())
    mockedGetAnalysisReviews.mockReset()
    mockedGetAnalysisReviews.mockResolvedValueOnce([
      review({ final_decision: 'REJECTED', reviewer_id: 'OFFICER-7', comments: 'Missing documents' }),
    ])
    renderPage('AN-1')

    await screen.findByText('Analysis summary')
    // The "Human review" heading renders with the panel, but the saved reviews
    // arrive asynchronously. Wait for the actual review content before asserting
    // synchronously, otherwise the assertions race the reviews request.
    expect(await screen.findByText('OFFICER-7')).toBeDefined()
    expect(screen.getByText('Human review')).toBeDefined()
    expect(screen.getAllByText('REJECTED').length).toBeGreaterThan(0)
    expect(screen.getByText('Missing documents')).toBeDefined()
    expect(mockedGetAnalysisReviews).toHaveBeenCalledWith('AN-1')
  })

  it('shows an explicit empty state when no reviews are saved', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved())
    renderPage('AN-1')

    await screen.findByText('Human review')
    expect(
      await screen.findByText('No human review has been recorded for this analysis yet.'),
    ).toBeDefined()
  })

  it('records a review, reports success, and refreshes the saved list', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved())
    mockedGetAnalysisReviews.mockReset()
    mockedGetAnalysisReviews
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        review({ final_decision: 'APPROVED', reviewer_id: 'OFFICER-9', comments: 'All good' }),
      ])
    mockedCreateReview.mockResolvedValueOnce(
      review({ final_decision: 'APPROVED', reviewer_id: 'OFFICER-9', comments: 'All good' }),
    )
    renderPage('AN-1')
    await screen.findByText('Human review')

    fireEvent.change(screen.getByLabelText(/outcome/i), {
      target: { value: 'APPROVED' },
    })
    fireEvent.change(screen.getByLabelText(/reviewer id/i), {
      target: { value: 'OFFICER-9' },
    })
    fireEvent.change(screen.getByLabelText(/notes/i), {
      target: { value: 'All good' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save review/i }))

    expect(await screen.findByText('Review saved')).toBeDefined()
    expect(mockedCreateReview).toHaveBeenCalledWith('AN-1', {
      final_decision: 'APPROVED',
      reviewer_id: 'OFFICER-9',
      comments: 'All good',
    })
    // The saved list is refreshed from the server and shows the new review.
    expect(await screen.findByText('OFFICER-9')).toBeDefined()
    expect(mockedGetAnalysisReviews).toHaveBeenCalledTimes(2)
  })

  it('requires an outcome and does not call the API without one', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved())
    renderPage('AN-1')
    await screen.findByText('Human review')

    fireEvent.click(screen.getByRole('button', { name: /save review/i }))

    expect(await screen.findByText('Select a review outcome.')).toBeDefined()
    expect(mockedCreateReview).not.toHaveBeenCalled()
  })

  it('disables submission while a request is in progress to prevent duplicates', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved())
    const pending = deferred<Review>()
    mockedCreateReview.mockImplementationOnce(() => pending.promise)
    renderPage('AN-1')
    await screen.findByText('Human review')

    fireEvent.change(screen.getByLabelText(/outcome/i), {
      target: { value: 'ESCALATED' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save review/i }))

    const button = (await screen.findByRole('button', {
      name: /saving/i,
    })) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')

    // A second activation must not start another request.
    fireEvent.click(button)
    expect(mockedCreateReview).toHaveBeenCalledTimes(1)

    pending.resolve(review({ final_decision: 'ESCALATED' }))
    expect(await screen.findByText('Review saved')).toBeDefined()
  })

  it('shows an error and never claims success when saving fails', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved())
    mockedCreateReview.mockRejectedValueOnce(
      new ApiError('http', 'server error', { status: 500 }),
    )
    renderPage('AN-1')
    await screen.findByText('Human review')

    fireEvent.change(screen.getByLabelText(/outcome/i), {
      target: { value: 'REJECTED' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save review/i }))

    expect(
      await screen.findByText('The review could not be saved'),
    ).toBeDefined()
    expect(
      screen.getAllByText('The backend returned an error (HTTP 500).').length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText('Review saved')).toBeNull()
  })

  it('maps a server validation error onto the outcome field', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved())
    mockedCreateReview.mockRejectedValueOnce(
      new ApiError('http', 'unprocessable', {
        status: 422,
        details: {
          detail: [
            { loc: ['body', 'final_decision'], msg: 'Invalid outcome' },
          ],
        },
      }),
    )
    renderPage('AN-1')
    await screen.findByText('Human review')

    fireEvent.change(screen.getByLabelText(/outcome/i), {
      target: { value: 'APPROVED' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save review/i }))

    expect(await screen.findByText('Invalid outcome')).toBeDefined()
  })

  it('distinguishes a missing analysis when reviews cannot be loaded', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved())
    mockedGetAnalysisReviews.mockReset()
    mockedGetAnalysisReviews.mockRejectedValueOnce(
      new ApiError('http', 'not found', { status: 404 }),
    )
    renderPage('AN-1')

    expect(
      await screen.findByText(
        'This analysis is no longer available, so its reviews could not be loaded.',
      ),
    ).toBeDefined()
  })

  it('surfaces a network error when reviews cannot be loaded', async () => {
    mockedGetAnalysisById.mockResolvedValueOnce(saved())
    mockedGetAnalysisReviews.mockReset()
    mockedGetAnalysisReviews.mockRejectedValueOnce(
      new ApiError('network', 'offline'),
    )
    renderPage('AN-1')

    expect(
      await screen.findByText('Saved reviews could not be loaded'),
    ).toBeDefined()
    expect(
      screen.getAllByText('Could not reach the backend service.').length,
    ).toBeGreaterThan(0)
  })
})
