import { requestJson, type RequestOptions } from './client'
import { API_V1_PREFIX } from './config'
import { ApiError, describeApiError, isApiError } from './errors'

/**
 * Human review API, mirroring the real backend contract
 * (`backend/db/schemas.py` + `backend/routers/reviews.py`).
 *
 *   POST /api/v1/analyses/{analysis_id}/reviews  -> `ReviewDB`   (201)
 *   GET  /api/v1/analyses/{analysis_id}/reviews  -> `ReviewDB[]` (200)
 *
 * A review records a decision a human reviewer explicitly submitted. The
 * platform never selects, approves, rejects or escalates a claim automatically;
 * these functions only read and store what the reviewer chose.
 */

/**
 * The only human review outcomes the platform accepts. Kept in sync with the
 * backend `REVIEW_OUTCOMES`; the dropdown offers exactly these values.
 */
export const REVIEW_OUTCOMES = [
  'APPROVED',
  'REJECTED',
  'NEEDS_MORE_INFO',
  'ESCALATED',
] as const

export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number]

/** A persisted human review as returned by the backend. */
export interface Review {
  /** The public review identifier. Every stored review has one. */
  review_id: string
  final_decision: string | null
  reviewer_id: string | null
  comments: string | null
  /** ISO-8601 timestamp string, or null when the record predates the column. */
  reviewed_at: string | null
  analysis_id: string | null
  claim_id: string | null
}

/** Body accepted by the create endpoint. */
export interface ReviewRequest {
  final_decision: ReviewOutcome
  reviewer_id?: string
  comments?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Accept a non-empty string; reject anything else (including null/undefined). */
function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiError(
      'parse',
      `Review response field "${field}" was missing or not a string`,
    )
  }
  return value
}

/** Accept a string, or `null`/`undefined` (preserved as null); reject the rest. */
function readNullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') {
    throw new ApiError('parse', `Review response field "${field}" was not a string`)
  }
  return value
}

/** Validate a raw review payload before trusting it. */
export function parseReview(value: unknown): Review {
  if (!isRecord(value)) {
    throw new ApiError('parse', 'Review response was not a JSON object')
  }
  return {
    review_id: readRequiredString(value.review_id, 'review_id'),
    final_decision: readNullableString(value.final_decision, 'final_decision'),
    reviewer_id: readNullableString(value.reviewer_id, 'reviewer_id'),
    comments: readNullableString(value.comments, 'comments'),
    reviewed_at: readNullableString(value.reviewed_at, 'reviewed_at'),
    analysis_id: readNullableString(value.analysis_id, 'analysis_id'),
    claim_id: readNullableString(value.claim_id, 'claim_id'),
  }
}

/** Validate a raw review-list payload before trusting it. */
export function parseReviewList(value: unknown): Review[] {
  if (!Array.isArray(value)) {
    throw new ApiError('parse', 'Reviews response was not a list')
  }
  return value.map((item) => parseReview(item))
}

/** Build a single, safely encoded path for an analysis's reviews. */
function reviewsPath(analysisId: string): string {
  return `${API_V1_PREFIX}/analyses/${encodeURIComponent(analysisId)}/reviews`
}

/**
 * Record a human review for one analysis. Throws `ApiError` on any failure; a
 * 404 (unknown analysis) stays an `ApiError` rather than becoming a success.
 * Blank `reviewer_id`/`comments` are omitted so empty strings are not stored.
 */
export async function createReview(
  analysisId: string,
  request: ReviewRequest,
  options: RequestOptions = {},
): Promise<Review> {
  const body: ReviewRequest = { final_decision: request.final_decision }
  const reviewerId = request.reviewer_id?.trim()
  if (reviewerId) body.reviewer_id = reviewerId
  const comments = request.comments?.trim()
  if (comments) body.comments = comments

  const payload = await requestJson(reviewsPath(analysisId), {
    ...options,
    method: 'POST',
    body,
  })
  return parseReview(payload)
}

/**
 * Fetch the saved reviews for an analysis, newest first. A 404 (unknown
 * analysis) is a distinct failure, not an empty review list.
 */
export async function getAnalysisReviews(
  analysisId: string,
  options: RequestOptions = {},
): Promise<Review[]> {
  const payload = await requestJson(reviewsPath(analysisId), options)
  return parseReviewList(payload)
}

/** Known request field names, used to map FastAPI validation errors to inputs. */
const REVIEW_REQUEST_FIELDS = new Set<string>([
  'final_decision',
  'reviewer_id',
  'comments',
])

export interface ReviewErrorInfo {
  /** Safe, user-facing summary. */
  message: string
  /** Per-field messages keyed by request field name (from FastAPI 422s). */
  fieldErrors: Record<string, string>
  /**
   * True when the outcome is unknown: the request may have reached the server
   * even though no response was received (timeout / connection drop). The UI
   * must not auto-retry in this case.
   */
  uncertain: boolean
  /** True when the analysis itself no longer exists (HTTP 404). */
  notFound: boolean
}

/**
 * Translate any review failure into safe, user-facing wording.
 *
 * FastAPI validation errors (`{"detail": [{"loc": [...], "msg": ...}]}`) are
 * mapped onto the offending fields. Everything else falls back to the generic
 * `describeApiError` wording, so raw bodies and stack traces are never shown.
 */
export function describeReviewError(error: unknown): ReviewErrorInfo {
  if (isApiError(error)) {
    const uncertain = error.kind === 'timeout' || error.kind === 'network'
    const notFound = error.kind === 'http' && error.status === 404

    if (notFound) {
      return {
        message: 'This analysis is no longer available, so the review was not saved.',
        fieldErrors: {},
        uncertain,
        notFound,
      }
    }

    const fieldErrors = extractValidationErrors(error.details)
    if (Object.keys(fieldErrors).length > 0) {
      return {
        message: 'The server rejected some of the review data.',
        fieldErrors,
        uncertain,
        notFound,
      }
    }

    return { message: describeApiError(error), fieldErrors: {}, uncertain, notFound }
  }

  return {
    message: 'An unexpected error occurred while saving the review.',
    fieldErrors: {},
    uncertain: false,
    notFound: false,
  }
}

/** Pull `field -> message` out of a FastAPI validation error body, if present. */
function extractValidationErrors(details: unknown): Record<string, string> {
  const result: Record<string, string> = {}
  if (!isRecord(details)) return result

  const detail = details.detail
  if (!Array.isArray(detail)) return result

  for (const item of detail) {
    if (!isRecord(item)) continue
    const loc = item.loc
    const msg = item.msg
    if (!Array.isArray(loc) || typeof msg !== 'string') continue

    // `loc` is like ["body", "final_decision"]; the last string is the field.
    const last = [...loc].reverse().find((part) => typeof part === 'string')
    if (typeof last !== 'string') continue

    if (!REVIEW_REQUEST_FIELDS.has(last)) continue
    result[last] = msg
  }

  return result
}
