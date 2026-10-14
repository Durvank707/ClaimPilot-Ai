import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NewClaimPage } from './NewClaimPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

function fakeResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as unknown as Response
}

function analysisPayload(overrides: Record<string, unknown> = {}) {
  return {
    claim_id: 'POLICY-42',
    fraud: { probability: 0.375 },
    severity: { predicted_claim_amount: 11076.09 },
    anomaly: { score: -0.047 },
    risk: { score: 31.2, level: 'MEDIUM' },
    explanation: {
      fraud: { probability: 0.375 },
      anomaly: { score: -0.047 },
      severity: { predicted_amount: 11076.09 },
      risk: {
        score: 31.2,
        level: 'MEDIUM',
        components: { fraud: 37.5, anomaly: -4.73, severity: 54.39 },
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
    analysis_id: 'AN-1',
    persisted: true,
    ...overrides,
  }
}

/** Render the page with `fetch` replaced by a spy. */
function renderPage(impl: (...args: unknown[]) => unknown) {
  const fetchSpy = vi.fn(impl as never)
  vi.stubGlobal('fetch', fetchSpy)
  render(<NewClaimPage />)
  return fetchSpy
}

function ok(overrides: Record<string, unknown> = {}) {
  return async () => fakeResponse(JSON.stringify(analysisPayload(overrides)))
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/Policy ID/), {
    target: { value: 'POLICY-42' },
  })
  fireEvent.change(screen.getByLabelText(/Incident date/), {
    target: { value: '2024-05-01' },
  })
  fireEvent.change(screen.getByLabelText(/Claim amount/), {
    target: { value: '18500' },
  })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /analyse claim|try again/i }))
}

describe('NewClaimPage', () => {
  it('renders the four sections and their field labels', () => {
    renderPage(ok())

    for (const title of [
      'Policy Information',
      'Insured Person',
      'Incident Details',
      'Claim Information',
    ]) {
      expect(screen.getByText(title)).toBeDefined()
    }

    expect(screen.getByLabelText(/Policy ID/)).toBeDefined()
    expect(screen.getByLabelText(/^Policy state/)).toBeDefined()
    expect(screen.getByLabelText(/^Age/)).toBeDefined()
    expect(screen.getByLabelText(/Incident city/)).toBeDefined()
    expect(screen.getByLabelText(/Police report available/)).toBeDefined()
    expect(screen.getByLabelText(/Claim amount/)).toBeDefined()
    expect(screen.getByRole('button', { name: /analyse claim/i })).toBeDefined()
  })

  it('only offers categorical values accepted by the model', () => {
    renderPage(ok())
    const sexOptions = Array.from(
      (screen.getByLabelText(/^Sex/) as HTMLSelectElement).options,
    ).map((option) => option.value)
    expect(sexOptions).toEqual(['', 'FEMALE', 'MALE', 'OTHER'])
  })

  it('blocks submission when required fields are missing', () => {
    const fetchSpy = renderPage(ok())
    submit()

    expect(screen.getAllByText('Policy ID is required.').length).toBeGreaterThan(
      0,
    )
    expect(screen.getAllByText('Claim amount is required.').length).toBeGreaterThan(
      0,
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('blocks submission when a numeric value is out of range', () => {
    const fetchSpy = renderPage(ok())
    fireEvent.change(screen.getByLabelText(/Incident hour/), {
      target: { value: '27' },
    })
    fillRequiredFields()
    submit()

    expect(
      screen.getAllByText('Incident hour must be 23 or less.').length,
    ).toBeGreaterThan(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('submits the claim once and renders the returned analysis dashboard', async () => {
    const fetchSpy = renderPage(ok())
    fillRequiredFields()
    submit()

    expect(await screen.findByText('Claim Analysis')).toBeDefined()
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/v1\/claims\/analyze$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      policy_id: 'POLICY-42',
      incident_date: '2024-05-01',
      claim_amount: 18500,
    })

    expect(screen.getByText('Claim ID: POLICY-42')).toBeDefined()
  })

  it('renders the real values from the response without refetching', async () => {
    const fetchSpy = renderPage(ok())
    fillRequiredFields()
    submit()
    await screen.findByText('Claim Analysis')

    // Each metric is taken straight from the response.
    expect(screen.getAllByText('37.5%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$11,076.09').length).toBeGreaterThan(0)
    expect(screen.getAllByText('-0.047').length).toBeGreaterThan(0)
    expect(screen.getAllByText('31.2').length).toBeGreaterThan(0)
    expect(screen.getAllByText('ENHANCED_REVIEW').length).toBeGreaterThan(0)
    expect(
      screen.getByText('Perform additional claim verification.'),
    ).toBeDefined()

    // The same claim is not submitted again to obtain results.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('represents a missing claim_id without fabricating one', async () => {
    renderPage(ok({ claim_id: null }))
    fillRequiredFields()
    submit()

    await screen.findByText('Claim Analysis')
    expect(screen.getByText('Claim ID not returned')).toBeDefined()
  })

  it('shows a loading state and prevents duplicate submissions', async () => {
    let resolveFetch: (response: Response) => void = () => {}
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve
    })
    const fetchSpy = renderPage(() => pending)

    fillRequiredFields()
    submit()

    const loadingButton = await screen.findByRole('button', {
      name: /analysing/i,
    })
    expect((loadingButton as HTMLButtonElement).disabled).toBe(true)

    // A second activation must not start another request.
    fireEvent.click(loadingButton)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    resolveFetch(fakeResponse(JSON.stringify(analysisPayload())))
    await screen.findByText('Claim Analysis')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('surfaces server validation errors and preserves the input', async () => {
    const fetchSpy = renderPage(async () =>
      fakeResponse(
        JSON.stringify({
          detail: [
            {
              loc: ['body', 'claim_amount'],
              msg: 'Input should be a valid number',
            },
          ],
        }),
        422,
      ),
    )

    fillRequiredFields()
    submit()

    expect(
      await screen.findByText('The claim could not be analysed'),
    ).toBeDefined()
    expect(
      screen.getAllByText('Input should be a valid number').length,
    ).toBeGreaterThan(0)

    // Input is preserved and a retry is offered.
    expect((screen.getByLabelText(/Policy ID/) as HTMLInputElement).value).toBe(
      'POLICY-42',
    )
    expect(screen.getByRole('button', { name: /try again/i })).toBeDefined()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('shows a generic message for HTTP failures', async () => {
    renderPage(async () => fakeResponse('Server Error', 500))
    fillRequiredFields()
    submit()

    expect(
      await screen.findByText('The backend returned an error (HTTP 500).'),
    ).toBeDefined()
    expect(screen.getByRole('button', { name: /try again/i })).toBeDefined()
  })

  it('does not auto-retry after a network error and warns the outcome is unknown', async () => {
    const fetchSpy = renderPage(async () => {
      throw new TypeError('Failed to fetch')
    })

    fillRequiredFields()
    submit()

    expect(
      await screen.findByText('Could not reach the backend service.'),
    ).toBeDefined()
    expect(
      screen.getByText(/the server may still have processed this claim/i),
    ).toBeDefined()

    // No automatic retry: exactly one attempt was made.
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('reports an unexpected response shape as an error', async () => {
    renderPage(async () => fakeResponse(JSON.stringify({ unexpected: true })))
    fillRequiredFields()
    submit()

    expect(
      await screen.findByText('The backend returned an unexpected response.'),
    ).toBeDefined()
    expect(screen.queryByText('Claim Analysis')).toBeNull()
  })

  it('returns to an empty form from the results dashboard', async () => {
    renderPage(ok())
    fillRequiredFields()
    submit()
    await screen.findByText('Claim Analysis')

    fireEvent.click(
      screen.getByRole('button', { name: /start another analysis/i }),
    )

    expect(screen.queryByText('Claim Analysis')).toBeNull()
    expect((screen.getByLabelText(/Policy ID/) as HTMLInputElement).value).toBe(
      '',
    )
  })
})
