/**
 * Runtime configuration for the ClaimPilot API client.
 *
 * All backend URLs are derived from this single module so components never
 * hardcode hostnames or paths.
 */

/**
 * Base URL of the ClaimPilot backend, taken from `VITE_API_BASE_URL`.
 *
 * - Unset          -> falls back to the local development backend.
 * - Empty string   -> relative requests, i.e. same-origin. Use this with the
 *                     Vite dev proxy (`/api` -> backend) to avoid CORS locally.
 * - Absolute URL   -> requests go directly to that backend (requires CORS).
 *
 * A trailing slash is stripped so paths join predictably.
 */
const configured = import.meta.env.VITE_API_BASE_URL

export const API_BASE_URL: string = (
  configured ?? 'http://localhost:8000'
).replace(/\/+$/, '')

/** Versioned prefix served by the backend (see backend/main.py). */
export const API_V1_PREFIX = '/api/v1'

/** Default request timeout. Keeps the UI responsive if the backend hangs. */
export const DEFAULT_TIMEOUT_MS = 8000
