import {
  fetchHealth,
  fetchReady,
  isReady,
  type HealthResponse,
  type ReadyResponse,
} from './health'

/**
 * Overall connection state of the frontend to the backend.
 *
 * - `checking`    – a check is in progress
 * - `ready`       – backend reachable and analysis models are loaded
 * - `not-ready`   – backend reachable but not ready to analyse claims
 * - `unreachable` – the backend could not be reached at all
 */
export type ConnectionPhase = 'checking' | 'ready' | 'not-ready' | 'unreachable'

export interface ConnectionResult {
  phase: Exclude<ConnectionPhase, 'checking'>
  health?: HealthResponse
  ready?: ReadyResponse
  /** Safe, human-readable summary (no internal detail). */
  detail: string
  /** Epoch milliseconds when the check completed. */
  checkedAt: number
}

/** Injectable dependencies so the check can be tested without real network. */
export interface ConnectionDeps {
  fetchHealth: typeof fetchHealth
  fetchReady: typeof fetchReady
}

/**
 * Probe the backend: health first (is it reachable?), then readiness
 * (can it analyse claims?). Readiness is only consulted once health succeeds,
 * so a reachable-but-not-ready backend is never reported as ready.
 */
export async function checkBackend(
  deps: Partial<ConnectionDeps> = {},
): Promise<ConnectionResult> {
  const getHealth = deps.fetchHealth ?? fetchHealth
  const getReady = deps.fetchReady ?? fetchReady
  const checkedAt = Date.now()

  let health: HealthResponse
  try {
    health = await getHealth()
  } catch {
    return {
      phase: 'unreachable',
      detail: 'The backend service could not be reached.',
      checkedAt,
    }
  }

  try {
    const ready = await getReady()
    if (isReady(ready)) {
      return {
        phase: 'ready',
        health,
        ready,
        detail: 'Backend reachable and analysis models are loaded.',
        checkedAt,
      }
    }
    return {
      phase: 'not-ready',
      health,
      ready,
      detail: 'Backend reachable, but the analysis models are not ready yet.',
      checkedAt,
    }
  } catch {
    return {
      phase: 'not-ready',
      health,
      detail: 'Backend reachable, but readiness could not be confirmed.',
      checkedAt,
    }
  }
}
