import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConnectionStatus } from './ConnectionStatus'

function fakeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

/** Queue a health response followed by a readiness response. */
function mockHealthyBackend(ready: Response = fakeResponse({ status: 'ready', models_loaded: true })) {
  const fn = vi.fn()
  fn.mockResolvedValueOnce(fakeResponse({ status: 'healthy' }))
  fn.mockResolvedValueOnce(ready)
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ConnectionStatus', () => {
  it('shows a loading state, then reports ready', async () => {
    mockHealthyBackend()
    render(<ConnectionStatus />)

    // Initially checking (both the full and short label exist in the DOM).
    expect(screen.getAllByText(/checking/i).length).toBeGreaterThan(0)

    expect(await screen.findByText('Backend ready')).toBeDefined()
  })

  it('reports not-ready when the backend is reachable but models are not loaded', async () => {
    mockHealthyBackend(fakeResponse({ status: 'not_ready', models_loaded: false }))
    render(<ConnectionStatus />)

    expect(await screen.findByText('Backend not ready')).toBeDefined()
  })

  it('reports unavailable when the backend cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    render(<ConnectionStatus />)

    expect(await screen.findByText('Backend unavailable')).toBeDefined()
  })

  it('re-checks the connection when refresh is pressed', async () => {
    const fetchMock = vi.fn(async () => fakeResponse({ status: 'healthy' }))
    vi.stubGlobal('fetch', fetchMock)
    render(<ConnectionStatus />)

    const button = screen.getByRole('button', {
      name: /re-check backend connection/i,
    })

    // The refresh button is disabled while a check is in progress, so wait for
    // the mount check to settle before clicking. Without this the click can be
    // swallowed when it lands after the requests resolve but before React has
    // committed the idle state.
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false),
    )

    const before = fetchMock.mock.calls.length
    fireEvent.click(button)

    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(before + 1),
    )
  })
})
