import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ClaimLookupPage } from './ClaimLookupPage'
import { getClaimById, type ClaimDetails } from '../api/retrieval'
import { ApiError } from '../api/errors'

// Mock the retrieval API function itself so no backend is required.
vi.mock('../api/retrieval', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/retrieval')>()
  return { ...actual, getClaimById: vi.fn() }
})

const mockedGetClaimById = vi.mocked(getClaimById)

function claimPayload(overrides: Partial<ClaimDetails> = {}): ClaimDetails {
  return {
    claim_id: 'CLM-1',
    policy_id: 'POL-1',
    created_at: '2024-05-01T10:00:00',
    policy_state: 'CA',
    claim_amount: 18500,
    incident_type: 'Parked Car',
    incident_date: '2024-05-01',
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

function renderPage() {
  return render(<ClaimLookupPage />)
}

function input() {
  return screen.getByLabelText(/Claim ID/) as HTMLInputElement
}

function form() {
  return screen.getByRole('form', { name: /claim lookup form/i })
}

function searchButton() {
  return screen.getByRole('button', { name: /^search$/i })
}

async function typeAndSearch(value: string) {
  fireEvent.change(input(), { target: { value } })
  fireEvent.click(searchButton())
}

describe('ClaimLookupPage', () => {
  it('renders an accessible claim ID field in the initial state', () => {
    renderPage()

    expect(screen.getByLabelText(/Claim ID/)).toBeDefined()
    expect(searchButton()).toBeDefined()
    expect(screen.getByText('No claim selected')).toBeDefined()
    expect(mockedGetClaimById).not.toHaveBeenCalled()
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

    expect(mockedGetClaimById).not.toHaveBeenCalled()
  })

  it('looks up a claim and displays its stored fields', async () => {
    mockedGetClaimById.mockResolvedValueOnce(claimPayload())
    renderPage()

    await typeAndSearch('CLM-1')

    expect(await screen.findByText('Claim details')).toBeDefined()
    expect(screen.getByText('Claim ID: CLM-1')).toBeDefined()
    expect(screen.getByText('POL-1')).toBeDefined()
    expect(screen.getByText('May 1, 2024, 10:00 AM')).toBeDefined()
    expect(screen.getByText('CA')).toBeDefined()
    expect(screen.getByText('$18,500.00')).toBeDefined()
    expect(screen.getByText('Parked Car')).toBeDefined()
    expect(screen.getByText('May 1, 2024')).toBeDefined()
    expect(mockedGetClaimById).toHaveBeenCalledWith('CLM-1')
  })

  it('renders null fields with an honest placeholder', async () => {
    mockedGetClaimById.mockResolvedValueOnce(
      claimPayload({
        policy_id: null,
        created_at: null,
        policy_state: null,
        claim_amount: null,
        incident_type: null,
        incident_date: null,
      }),
    )
    renderPage()

    await typeAndSearch('CLM-1')
    await screen.findByText('Claim details')

    // Six nullable fields are missing; claim_id is present.
    expect(screen.getAllByText('Not available')).toHaveLength(6)
  })

  it('trims whitespace from the submitted claim ID', async () => {
    mockedGetClaimById.mockResolvedValueOnce(claimPayload())
    renderPage()

    await typeAndSearch('  CLM-1  ')
    await screen.findByText('Claim details')

    expect(mockedGetClaimById).toHaveBeenCalledWith('CLM-1')
  })

  it('supports submitting the form with Enter', async () => {
    mockedGetClaimById.mockResolvedValueOnce(claimPayload())
    renderPage()

    fireEvent.change(input(), { target: { value: 'CLM-1' } })
    fireEvent.submit(form())

    expect(await screen.findByText('Claim details')).toBeDefined()
    expect(mockedGetClaimById).toHaveBeenCalledWith('CLM-1')
  })

  it('shows a loading state and prevents duplicate submissions', async () => {
    const pending = deferred<ClaimDetails>()
    mockedGetClaimById.mockImplementationOnce(() => pending.promise)
    renderPage()

    await typeAndSearch('CLM-1')

    expect(await screen.findByText('Looking up claim…')).toBeDefined()
    const busyButton = screen.getByRole('button', { name: /searching/i })
    expect((busyButton as HTMLButtonElement).disabled).toBe(true)

    // Neither a second click nor a repeated form submit starts another request.
    fireEvent.click(busyButton)
    fireEvent.submit(form())
    expect(mockedGetClaimById).toHaveBeenCalledTimes(1)

    pending.resolve(claimPayload())
    expect(await screen.findByText('Claim details')).toBeDefined()
    expect(mockedGetClaimById).toHaveBeenCalledTimes(1)
  })

  it('shows a not-found state for a 404', async () => {
    mockedGetClaimById.mockRejectedValueOnce(
      new ApiError('http', 'not found', { status: 404 }),
    )
    renderPage()

    await typeAndSearch('MISSING')

    expect(await screen.findByText('No saved claim found')).toBeDefined()
    expect(screen.queryByText('Claim details')).toBeNull()
  })

  it('shows a network error state when the backend is unreachable', async () => {
    mockedGetClaimById.mockRejectedValueOnce(new ApiError('network', 'offline'))
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
    mockedGetClaimById.mockRejectedValueOnce(
      new ApiError('http', 'server error', { status: 500 }),
    )
    renderPage()

    await typeAndSearch('CLM-1')

    expect(
      await screen.findByText('The claim could not be retrieved'),
    ).toBeDefined()
    expect(
      screen.getAllByText('The backend returned an error (HTTP 500).').length,
    ).toBeGreaterThan(0)
  })

  it('replaces the previous result when a new claim is searched', async () => {
    mockedGetClaimById
      .mockResolvedValueOnce(claimPayload())
      .mockResolvedValueOnce(
        claimPayload({ claim_id: 'CLM-2', policy_id: 'POL-2' }),
      )
    renderPage()

    await typeAndSearch('CLM-1')
    await screen.findByText('Claim details')
    expect(screen.getByText('POL-1')).toBeDefined()

    await typeAndSearch('CLM-2')
    await screen.findByText('POL-2')

    expect(screen.queryByText('POL-1')).toBeNull()
    expect(screen.getByText('Claim ID: CLM-2')).toBeDefined()
  })

  it('does not let an older request overwrite a newer result', async () => {
    const slow = deferred<ClaimDetails>()
    mockedGetClaimById
      .mockImplementationOnce(() => slow.promise)
      .mockResolvedValueOnce(
        claimPayload({ claim_id: 'CLM-B', policy_id: 'POL-B' }),
      )
    renderPage()

    await typeAndSearch('CLM-A')

    // Start a second search while the first is still pending.
    fireEvent.change(input(), { target: { value: 'CLM-B' } })
    fireEvent.submit(form())
    await screen.findByText('POL-B')
    expect(mockedGetClaimById).toHaveBeenCalledTimes(2)

    // The older request now resolves; it must be ignored.
    slow.resolve(claimPayload({ claim_id: 'CLM-A', policy_id: 'POL-A' }))
    await waitFor(() => expect(screen.getByText('POL-B')).toBeDefined())
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(screen.queryByText('POL-A')).toBeNull()
    expect(screen.getByText('Claim ID: CLM-B')).toBeDefined()
  })
})
