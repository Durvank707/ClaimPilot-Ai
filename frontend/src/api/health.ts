import { requestJson, type RequestOptions } from './client'
import { API_V1_PREFIX } from './config'
import { ApiError } from './errors'

/**
 * Response types mirror the actual backend routes
 * (`backend/routers/health.py`):
 *
 *   GET /api/v1/health -> { "status": "healthy" }
 *   GET /api/v1/ready  -> { "status": "ready" | "not_ready", "models_loaded": bool }
 *
 * Note that `/ready` returns HTTP 200 even when the service is not ready, so
 * readiness must be decided from the body rather than the status code.
 */
export interface HealthResponse {
  status: string
}

export interface ReadyResponse {
  status: string
  models_loaded: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Validate a raw `/health` payload before trusting it. */
export function parseHealthResponse(value: unknown): HealthResponse {
  if (!isRecord(value) || typeof value.status !== 'string') {
    throw new ApiError('parse', 'Health response did not match the expected shape')
  }
  return { status: value.status }
}

/** Validate a raw `/ready` payload before trusting it. */
export function parseReadyResponse(value: unknown): ReadyResponse {
  if (
    !isRecord(value) ||
    typeof value.status !== 'string' ||
    typeof value.models_loaded !== 'boolean'
  ) {
    throw new ApiError(
      'parse',
      'Readiness response did not match the expected shape',
    )
  }
  return { status: value.status, models_loaded: value.models_loaded }
}

/**
 * The backend reports readiness as "ready" once the analysis models have been
 * loaded. Both conditions must hold to treat the service as ready.
 */
export function isReady(response: ReadyResponse): boolean {
  return response.status === 'ready' && response.models_loaded === true
}

/** Fetch and validate the backend liveness response. */
export async function fetchHealth(
  options: RequestOptions = {},
): Promise<HealthResponse> {
  const payload = await requestJson(`${API_V1_PREFIX}/health`, options)
  return parseHealthResponse(payload)
}

/** Fetch and validate the backend readiness response. */
export async function fetchReady(
  options: RequestOptions = {},
): Promise<ReadyResponse> {
  const payload = await requestJson(`${API_V1_PREFIX}/ready`, options)
  return parseReadyResponse(payload)
}
