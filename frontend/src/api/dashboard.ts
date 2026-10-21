import { requestJson, type RequestOptions } from './client'
import { API_V1_PREFIX } from './config'
import { ApiError } from './errors'

/**
 * Dashboard summary API, mirroring the real backend contract
 * (`backend/db/schemas.py` + `backend/routers/dashboard.py`).
 *
 *   GET /api/v1/dashboard/summary?recent_limit=5  ->  `DashboardSummaryDB`
 *   GET /api/v1/dashboard/review-queue?scope=awaiting&order=risk
 *        -> `DashboardReviewQueueDB`
 *
 * The endpoints aggregate persisted records only. They never run ML inference and
 * never fabricate a value, so every figure here is a real count or a stored
 * field. A single summary request supplies the whole dashboard, avoiding a
 * request per widget.
 *
 * Counting semantics (kept explicit so the UI cannot mislabel them):
 * - `totals.claims`    persisted claims (distinct claim records).
 * - `totals.analyses`  persisted analyses — NOT a count of unique claims.
 * - `totals.reviews`   review *records*; one analysis may have several.
 * - `review_outcomes`  review records grouped by outcome.
 * - `latest_review_outcomes` analyses grouped by the outcome of their most
 *   recently recorded review.
 * - `risk_review_status` analyses split by reviewed/awaiting within each bucket.
 * - `recent_reviews`   newest review records (orphans excluded).
 * - The review queue orders analyses for a human to triage; it never decides.
 */

/** Persisted record counts. `analyses` is deliberately not labelled as claims. */
export interface DashboardTotals {
  claims: number
  analyses: number
  reviews: number
}

/** Analyses grouped by prioritisation level; unrecognised values fold to UNKNOWN. */
export interface DashboardRiskDistribution {
  LOW: number
  MEDIUM: number
  HIGH: number
  CRITICAL: number
  UNKNOWN: number
}

/** Counts keyed by the accepted review outcomes, plus UNKNOWN. */
export interface DashboardReviewOutcomes {
  APPROVED: number
  REJECTED: number
  NEEDS_MORE_INFO: number
  ESCALATED: number
  UNKNOWN: number
}

/** One lightweight row of recent activity (no explanation/decision payload). */
export interface DashboardRecentAnalysis {
  analysis_id: string | null
  claim_id: string | null
  /** ISO-8601 timestamp string, or null when not recorded. */
  analyzed_at: string | null
  fraud_probability: number | null
  predicted_claim_amount: number | null
  anomaly_score: number | null
  risk_score: number | null
  risk_level: string | null
  recommendation: string | null
}

/**
 * Per-analysis review status for one risk bucket. These are analyses, never
 * review records: an analysis with several reviews still counts once.
 */
export interface DashboardRiskReviewStatusRow {
  total: number
  awaiting_review: number
  reviewed: number
}

/** Review status for every risk bucket, including the UNKNOWN fallback. */
export interface DashboardRiskReviewStatus {
  LOW: DashboardRiskReviewStatusRow
  MEDIUM: DashboardRiskReviewStatusRow
  HIGH: DashboardRiskReviewStatusRow
  CRITICAL: DashboardRiskReviewStatusRow
  UNKNOWN: DashboardRiskReviewStatusRow
}

/**
 * One human-review *record*. An analysis may have several, so this list is not
 * a list of unique reviewed analyses.
 */
export interface DashboardRecentReview {
  review_id: string | null
  /** Accepted review outcome, UNKNOWN for an unrecognised stored value. */
  final_decision: string | null
  reviewer_id: string | null
  reviewed_at: string | null
  analysis_id: string | null
  claim_id: string | null
  risk_level: string | null
}

/** The complete dashboard payload. */
export interface DashboardSummary {
  totals: DashboardTotals
  high_critical_analyses: number
  analyses_with_reviews: number
  analyses_awaiting_review: number
  risk_distribution: DashboardRiskDistribution
  review_outcomes: DashboardReviewOutcomes
  latest_review_outcomes: DashboardReviewOutcomes
  recent_analyses: DashboardRecentAnalysis[]
  risk_review_status: DashboardRiskReviewStatus
  recent_reviews: DashboardRecentReview[]
  /** Oldest analyzed_at among unreviewed analyses, or null when none wait. */
  oldest_awaiting_analyzed_at: string | null
}

/** Query parameters accepted by the summary endpoint. */
export interface DashboardSummaryQuery {
  recentLimit?: number
}

/** Query parameters combined with the shared request options. */
export type DashboardSummaryOptions = DashboardSummaryQuery & RequestOptions

/** Backend default for the number of recent analyses, mirrored for callers. */
export const DEFAULT_DASHBOARD_RECENT_LIMIT = 5

/** Review queue scopes, mirroring the backend contract. */
export type ReviewQueueScope = 'awaiting' | 'open' | 'all'
/** Review queue ordering, mirroring the backend contract. */
export type ReviewQueueOrder = 'risk' | 'recent'

/**
 * One prioritised analysis in the human-review worklist. `latest_*` describe
 * the most recent review *record*, so `review_count` may exceed one.
 */
export interface DashboardReviewQueueItem {
  analysis_id: string | null
  claim_id: string | null
  analyzed_at: string | null
  risk_score: number | null
  risk_level: string | null
  fraud_probability: number | null
  predicted_claim_amount: number | null
  anomaly_score: number | null
  recommendation: string | null
  review_count: number
  latest_review_outcome: string | null
  latest_reviewed_at: string | null
  incident_type: string | null
  claim_amount: number | null
}

/** One page of the review queue; `total` is the full match count. */
export interface DashboardReviewQueuePage {
  items: DashboardReviewQueueItem[]
  total: number
  limit: number
  offset: number
}

/** Query parameters accepted by the review-queue endpoint. */
export interface ReviewQueueQuery {
  limit?: number
  offset?: number
  scope?: ReviewQueueScope
  /** Case-insensitive risk bucket, e.g. "HIGH" or "UNKNOWN". */
  riskLevel?: string
  order?: ReviewQueueOrder
}

export type ReviewQueueOptions = ReviewQueueQuery & RequestOptions

/** Backend defaults, mirrored so every request is deterministic. */
export const DEFAULT_REVIEW_QUEUE_LIMIT = 10
export const DEFAULT_REVIEW_QUEUE_OFFSET = 0
export const DEFAULT_REVIEW_QUEUE_SCOPE: ReviewQueueScope = 'awaiting'
export const DEFAULT_REVIEW_QUEUE_ORDER: ReviewQueueOrder = 'risk'

export const REVIEW_QUEUE_SCOPES: readonly ReviewQueueScope[] = [
  'awaiting',
  'open',
  'all',
]
export const REVIEW_QUEUE_ORDERS: readonly ReviewQueueOrder[] = ['risk', 'recent']

/** Buckets accepted by the queue risk filter, in display order. */
export const DASHBOARD_RISK_FILTER_OPTIONS = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
  'UNKNOWN',
] as const

const RISK_KEYS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
const OUTCOME_KEYS = [
  'APPROVED',
  'REJECTED',
  'NEEDS_MORE_INFO',
  'ESCALATED',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Accept a non-negative integer (used for every count). */
function readCount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ApiError('parse', `Response field "${field}" was not a count`)
  }
  return value
}

/** Accept a string, or `null`/`undefined` (preserved as null); reject the rest. */
function readNullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') {
    throw new ApiError('parse', `Response field "${field}" was not a string`)
  }
  return value
}

/** Accept a finite number, or `null`/`undefined` (preserved as null). */
function readNullableNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ApiError('parse', `Response field "${field}" was not a number`)
  }
  return value
}

function readObject(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ApiError('parse', `Response field "${field}" was not an object`)
  }
  return value
}

function parseTotals(value: unknown): DashboardTotals {
  const totals = readObject(value, 'totals')
  return {
    claims: readCount(totals.claims, 'totals.claims'),
    analyses: readCount(totals.analyses, 'totals.analyses'),
    reviews: readCount(totals.reviews, 'totals.reviews'),
  }
}

function parseRiskDistribution(value: unknown): DashboardRiskDistribution {
  const distribution = readObject(value, 'risk_distribution')
  return {
    LOW: readCount(distribution.LOW, 'risk_distribution.LOW'),
    MEDIUM: readCount(distribution.MEDIUM, 'risk_distribution.MEDIUM'),
    HIGH: readCount(distribution.HIGH, 'risk_distribution.HIGH'),
    CRITICAL: readCount(distribution.CRITICAL, 'risk_distribution.CRITICAL'),
    UNKNOWN: readCount(distribution.UNKNOWN, 'risk_distribution.UNKNOWN'),
  }
}

function parseReviewOutcomes(
  value: unknown,
  field: string,
): DashboardReviewOutcomes {
  const outcomes = readObject(value, field)
  return {
    APPROVED: readCount(outcomes.APPROVED, `${field}.APPROVED`),
    REJECTED: readCount(outcomes.REJECTED, `${field}.REJECTED`),
    NEEDS_MORE_INFO: readCount(
      outcomes.NEEDS_MORE_INFO,
      `${field}.NEEDS_MORE_INFO`,
    ),
    ESCALATED: readCount(outcomes.ESCALATED, `${field}.ESCALATED`),
    UNKNOWN: readCount(outcomes.UNKNOWN, `${field}.UNKNOWN`),
  }
}

function parseRiskReviewStatusRow(
  value: unknown,
  field: string,
): DashboardRiskReviewStatusRow {
  const row = readObject(value, field)
  return {
    total: readCount(row.total, `${field}.total`),
    awaiting_review: readCount(
      row.awaiting_review,
      `${field}.awaiting_review`,
    ),
    reviewed: readCount(row.reviewed, `${field}.reviewed`),
  }
}

function parseRiskReviewStatus(value: unknown): DashboardRiskReviewStatus {
  const status = readObject(value, 'risk_review_status')
  return {
    LOW: parseRiskReviewStatusRow(status.LOW, 'risk_review_status.LOW'),
    MEDIUM: parseRiskReviewStatusRow(
      status.MEDIUM,
      'risk_review_status.MEDIUM',
    ),
    HIGH: parseRiskReviewStatusRow(status.HIGH, 'risk_review_status.HIGH'),
    CRITICAL: parseRiskReviewStatusRow(
      status.CRITICAL,
      'risk_review_status.CRITICAL',
    ),
    UNKNOWN: parseRiskReviewStatusRow(
      status.UNKNOWN,
      'risk_review_status.UNKNOWN',
    ),
  }
}

function parseRecentReview(
  value: unknown,
  index: number,
): DashboardRecentReview {
  if (!isRecord(value)) {
    throw new ApiError('parse', `Recent review ${index} was not an object`)
  }
  return {
    review_id: readNullableString(value.review_id, 'review_id'),
    final_decision: readNullableString(value.final_decision, 'final_decision'),
    reviewer_id: readNullableString(value.reviewer_id, 'reviewer_id'),
    reviewed_at: readNullableString(value.reviewed_at, 'reviewed_at'),
    analysis_id: readNullableString(value.analysis_id, 'analysis_id'),
    claim_id: readNullableString(value.claim_id, 'claim_id'),
    risk_level: readNullableString(value.risk_level, 'risk_level'),
  }
}

function parseReviewQueueItem(
  value: unknown,
  index: number,
): DashboardReviewQueueItem {
  if (!isRecord(value)) {
    throw new ApiError('parse', `Review queue item ${index} was not an object`)
  }
  return {
    analysis_id: readNullableString(value.analysis_id, 'analysis_id'),
    claim_id: readNullableString(value.claim_id, 'claim_id'),
    analyzed_at: readNullableString(value.analyzed_at, 'analyzed_at'),
    risk_score: readNullableNumber(value.risk_score, 'risk_score'),
    risk_level: readNullableString(value.risk_level, 'risk_level'),
    fraud_probability: readNullableNumber(
      value.fraud_probability,
      'fraud_probability',
    ),
    predicted_claim_amount: readNullableNumber(
      value.predicted_claim_amount,
      'predicted_claim_amount',
    ),
    anomaly_score: readNullableNumber(value.anomaly_score, 'anomaly_score'),
    recommendation: readNullableString(value.recommendation, 'recommendation'),
    review_count: readCount(value.review_count, 'review_count'),
    latest_review_outcome: readNullableString(
      value.latest_review_outcome,
      'latest_review_outcome',
    ),
    latest_reviewed_at: readNullableString(
      value.latest_reviewed_at,
      'latest_reviewed_at',
    ),
    incident_type: readNullableString(value.incident_type, 'incident_type'),
    claim_amount: readNullableNumber(value.claim_amount, 'claim_amount'),
  }
}

function parseRecentAnalysis(
  value: unknown,
  index: number,
): DashboardRecentAnalysis {
  if (!isRecord(value)) {
    throw new ApiError('parse', `Recent analysis ${index} was not an object`)
  }
  return {
    analysis_id: readNullableString(value.analysis_id, 'analysis_id'),
    claim_id: readNullableString(value.claim_id, 'claim_id'),
    analyzed_at: readNullableString(value.analyzed_at, 'analyzed_at'),
    fraud_probability: readNullableNumber(
      value.fraud_probability,
      'fraud_probability',
    ),
    predicted_claim_amount: readNullableNumber(
      value.predicted_claim_amount,
      'predicted_claim_amount',
    ),
    anomaly_score: readNullableNumber(value.anomaly_score, 'anomaly_score'),
    risk_score: readNullableNumber(value.risk_score, 'risk_score'),
    risk_level: readNullableString(value.risk_level, 'risk_level'),
    recommendation: readNullableString(value.recommendation, 'recommendation'),
  }
}

/** Validate a raw `GET /dashboard/summary` payload before trusting it. */
export function parseDashboardSummary(value: unknown): DashboardSummary {
  if (!isRecord(value)) {
    throw new ApiError('parse', 'Dashboard response was not a JSON object')
  }
  const recent = value.recent_analyses
  if (!Array.isArray(recent)) {
    throw new ApiError(
      'parse',
      'Dashboard response was missing the "recent_analyses" list',
    )
  }
  const recentReviews = value.recent_reviews
  if (!Array.isArray(recentReviews)) {
    throw new ApiError(
      'parse',
      'Dashboard response was missing the "recent_reviews" list',
    )
  }
  return {
    totals: parseTotals(value.totals),
    high_critical_analyses: readCount(
      value.high_critical_analyses,
      'high_critical_analyses',
    ),
    analyses_with_reviews: readCount(
      value.analyses_with_reviews,
      'analyses_with_reviews',
    ),
    analyses_awaiting_review: readCount(
      value.analyses_awaiting_review,
      'analyses_awaiting_review',
    ),
    risk_distribution: parseRiskDistribution(value.risk_distribution),
    review_outcomes: parseReviewOutcomes(value.review_outcomes, 'review_outcomes'),
    latest_review_outcomes: parseReviewOutcomes(
      value.latest_review_outcomes,
      'latest_review_outcomes',
    ),
    recent_analyses: recent.map((item, index) => parseRecentAnalysis(item, index)),
    risk_review_status: parseRiskReviewStatus(value.risk_review_status),
    recent_reviews: recentReviews.map((item, index) =>
      parseRecentReview(item, index),
    ),
    oldest_awaiting_analyzed_at: readNullableString(
      value.oldest_awaiting_analyzed_at,
      'oldest_awaiting_analyzed_at',
    ),
  }
}

/** The ordered risk levels shown as bars, including any UNKNOWN bucket. */
export const DASHBOARD_RISK_KEYS = RISK_KEYS
/** The ordered review outcomes shown in the review overview. */
export const DASHBOARD_OUTCOME_KEYS = OUTCOME_KEYS

/**
 * Fetch the aggregated dashboard summary. `recentLimit` mirrors the backend's
 * `recent_limit` parameter (1–20); it is always serialised so the request is
 * deterministic. A failure rejects with a typed `ApiError` and is never turned
 * into a zeroed summary, so "no data" can never be confused with "no response".
 */
export async function getDashboardSummary(
  options: DashboardSummaryOptions = {},
): Promise<DashboardSummary> {
  const { recentLimit, ...requestOptions } = options
  const query = new URLSearchParams({
    recent_limit: String(recentLimit ?? DEFAULT_DASHBOARD_RECENT_LIMIT),
  })
  const path = `${API_V1_PREFIX}/dashboard/summary?${query.toString()}`
  const payload = await requestJson(path, requestOptions)
  return parseDashboardSummary(payload)
}

/** Validate a raw `GET /dashboard/review-queue` payload before trusting it. */
export function parseReviewQueue(value: unknown): DashboardReviewQueuePage {
  if (!isRecord(value)) {
    throw new ApiError('parse', 'Review queue response was not a JSON object')
  }
  const items = value.items
  if (!Array.isArray(items)) {
    throw new ApiError(
      'parse',
      'Review queue response was missing the "items" list',
    )
  }
  return {
    items: items.map((item, index) => parseReviewQueueItem(item, index)),
    total: readCount(value.total, 'total'),
    limit: readCount(value.limit, 'limit'),
    offset: readCount(value.offset, 'offset'),
  }
}

/**
 * Fetch one page of the prioritised human-review queue.
 *
 * Every parameter is serialised so the request is deterministic. A failure
 * rejects with a typed `ApiError`; the caller must render an error rather than
 * an empty queue, so "no matching analyses" cannot be confused with "no
 * response".
 */
export async function getReviewQueue(
  options: ReviewQueueOptions = {},
): Promise<DashboardReviewQueuePage> {
  const { limit, offset, scope, riskLevel, order, ...requestOptions } = options
  const query = new URLSearchParams({
    limit: String(limit ?? DEFAULT_REVIEW_QUEUE_LIMIT),
    offset: String(offset ?? DEFAULT_REVIEW_QUEUE_OFFSET),
    scope: scope ?? DEFAULT_REVIEW_QUEUE_SCOPE,
    order: order ?? DEFAULT_REVIEW_QUEUE_ORDER,
  })
  const normalizedRisk = riskLevel?.trim()
  if (normalizedRisk) query.set('risk_level', normalizedRisk)
  const path = `${API_V1_PREFIX}/dashboard/review-queue?${query.toString()}`
  const payload = await requestJson(path, requestOptions)
  return parseReviewQueue(payload)
}
