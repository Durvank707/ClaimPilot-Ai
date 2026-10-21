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

/**
 * Optional shared bearer token from `VITE_API_TOKEN`. When set, every request
 * carries `Authorization: Bearer <token>`; when unset/blank no header is sent
 * (matching a backend that has authentication disabled outside production).
 *
 * This is a shared service token, not an individual reviewer identity.
 */
const configuredToken = import.meta.env.VITE_API_TOKEN

export const API_TOKEN: string = (configuredToken ?? '').trim()

/** Versioned prefix served by the backend (see backend/main.py). */
export const API_V1_PREFIX = '/api/v1'

/** Default request timeout. Keeps the UI responsive if the backend hangs. */
export const DEFAULT_TIMEOUT_MS = 8000
