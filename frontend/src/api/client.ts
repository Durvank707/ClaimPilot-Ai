import { API_BASE_URL, DEFAULT_TIMEOUT_MS } from './config'
import { ApiError } from './errors'

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  /**
   * JSON-serialisable request body. When provided the helper sends it as JSON
   * and sets `Content-Type: application/json`.
   */
  body?: unknown
  /** External cancellation signal (combined with the internal timeout). */
  signal?: AbortSignal
  /** Override the default request timeout for this call. */
  timeoutMs?: number
  /** Override the configured base URL (used in tests). */
  baseUrl?: string
}

function buildUrl(path: string, baseUrl?: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const base = (baseUrl ?? API_BASE_URL).replace(/\/+$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}`
}

async function readBody(response: Response): Promise<string | null> {
  try {
    return await response.text()
  } catch {
    return null
  }
}

/**
 * Best-effort JSON parse for an error body. Returns `undefined` for empty or
 * non-JSON bodies so callers can fall back to a generic message.
 */
function parseJsonOrUndefined(text: string | null): unknown {
  if (text === null || text.trim() === '') return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/**
 * Minimal JSON `fetch` wrapper used by every endpoint function.
 *
 * Responsibilities:
 * - joins the configured base URL with the path
 * - serialises an optional JSON body and sets the matching content type
 * - enforces a timeout via `AbortController` (browser-supported)
 * - checks `response.ok` and raises typed `ApiError`s (attaching the parsed
 *   error body as `details` so callers can extract validation messages)
 * - parses JSON defensively (never assumes the body is JSON)
 *
 * Returns `unknown` on purpose: callers must validate the shape before treating
 * the value as a known type.
 */
export async function requestJson(
  path: string,
  options: RequestOptions = {},
): Promise<unknown> {
  const {
    method = 'GET',
    headers,
    body,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    baseUrl,
  } = options

  const controller = new AbortController()
  let timedOut = false
  let abortedExternally = false

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const onExternalAbort = () => {
    abortedExternally = true
    controller.abort()
  }

  if (signal) {
    if (signal.aborted) {
      abortedExternally = true
      controller.abort()
    } else {
      signal.addEventListener('abort', onExternalAbort)
    }
  }

  try {
    let response: Response
    try {
      response = await fetch(buildUrl(path, baseUrl), {
        method,
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
    } catch {
      if (timedOut) {
        throw new ApiError(
          'timeout',
          `Request to ${path} timed out after ${timeoutMs} ms`,
          { path },
        )
      }
      if (abortedExternally) {
        throw new ApiError('aborted', `Request to ${path} was cancelled`, {
          path,
        })
      }
      throw new ApiError(
        'network',
        `Network request to ${path} failed before a response was received`,
        { path },
      )
    }

    // Read as text first so both error and success bodies are handled without
    // assuming JSON (e.g. an HTML error page must not throw a parse error).
    const raw = await readBody(response)

    if (!response.ok) {
      throw new ApiError(
        'http',
        `Request to ${path} failed with HTTP ${response.status}`,
        {
          status: response.status,
          path,
          details: parseJsonOrUndefined(raw),
        },
      )
    }

    if (raw === null) {
      throw new ApiError('network', `Response body for ${path} could not be read`, {
        path,
      })
    }
    if (raw.trim() === '') return null

    try {
      return JSON.parse(raw) as unknown
    } catch {
      throw new ApiError('parse', `Response from ${path} was not valid JSON`, {
        path,
      })
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onExternalAbort)
  }
}
