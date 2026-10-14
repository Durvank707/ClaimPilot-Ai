import { describe, expect, it, vi } from 'vitest'
import { checkBackend, type ConnectionDeps } from './connection'
import { ApiError } from './errors'
import type { HealthResponse, ReadyResponse } from './health'

const health: HealthResponse = { status: 'healthy' }
const ready: ReadyResponse = { status: 'ready', models_loaded: true }
const notReady: ReadyResponse = { status: 'not_ready', models_loaded: false }

function deps(overrides: Partial<ConnectionDeps> = {}): ConnectionDeps {
  return {
    fetchHealth: vi.fn(async () => health),
    fetchReady: vi.fn(async () => ready),
    ...overrides,
  }
}

describe('checkBackend', () => {
  it('reports ready when health and readiness both succeed', async () => {
    const result = await checkBackend(deps())
    expect(result.phase).toBe('ready')
    expect(result.health).toEqual(health)
    expect(result.ready).toEqual(ready)
    expect(result.checkedAt).toBeTypeOf('number')
  })

  it('reports not-ready when the backend is reachable but not ready', async () => {
    const result = await checkBackend(
      deps({ fetchReady: vi.fn(async () => notReady) }),
    )
    expect(result.phase).toBe('not-ready')
    expect(result.health).toEqual(health)
  })

  it('reports unreachable when health fails, without consulting readiness', async () => {
    const fetchReady = vi.fn(async () => ready)
    const result = await checkBackend(
      deps({
        fetchHealth: vi.fn(async () => {
          throw new ApiError('network', 'down')
        }),
        fetchReady,
      }),
    )
    expect(result.phase).toBe('unreachable')
    expect(fetchReady).not.toHaveBeenCalled()
  })

  it('reports not-ready when readiness cannot be confirmed', async () => {
    const result = await checkBackend(
      deps({
        fetchReady: vi.fn(async () => {
          throw new ApiError('http', 'boom', { status: 503 })
        }),
      }),
    )
    expect(result.phase).toBe('not-ready')
    expect(result.ready).toBeUndefined()
  })
})
