/** Categories of failure the API layer can report to callers. */
export type ApiErrorKind =
  | 'network' // the request never reached the backend (offline, DNS, CORS, ...)
  | 'timeout' // the backend did not respond within the configured timeout
  | 'aborted' // the caller cancelled the request
  | 'http' // the backend responded with a non-2xx status
  | 'parse' // the response body was not valid JSON or not the expected shape

/**
 * Error type raised by the API layer.
 *
 * Keeps a machine-readable `kind` and HTTP `status` internally while the
 * `describeApiError` helper produces safe, user-facing wording. Raw bodies and
 * stack traces are never surfaced to the UI.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number
  readonly path: string
  /** Parsed error payload from the backend, when it was JSON. Never shown raw. */
  readonly details?: unknown

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: { status?: number; path?: string; details?: unknown } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = options.status
    this.path = options.path ?? ''
    this.details = options.details
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/**
 * Human-readable message safe to show in the UI. Deliberately generic: it never
 * includes response bodies, URLs or internal exception detail.
 */
export function describeApiError(error: unknown): string {
  if (isApiError(error)) {
    switch (error.kind) {
      case 'network':
        return 'Could not reach the backend service.'
      case 'timeout':
        return 'The backend did not respond in time.'
      case 'aborted':
        return 'The request was cancelled.'
      case 'http':
        return error.status
          ? `The backend returned an error (HTTP ${error.status}).`
          : 'The backend returned an error.'
      case 'parse':
        return 'The backend returned an unexpected response.'
    }
  }
  return 'An unexpected error occurred while contacting the backend.'
}
