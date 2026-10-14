import { requestJson, type RequestOptions } from './client'
import { API_V1_PREFIX } from './config'
import { ApiError } from './errors'

/**
 * Retrieval API for stored claims and analyses.
 *
 * Mirrors the real backend contracts (authoritative sources):
 *
 *   GET /api/v1/claims/{claim_id}
 *     -> `ClaimDB`        (`backend/db/schemas.py`)
 *   GET /api/v1/analyses/{analysis_id}
 *     -> `AnalysisDB`     (`backend/db/schemas.py`)
 *   GET /api/v1/claims/{claim_id}/analyses?limit=&offset=&order=
 *     -> `ClaimAnalysisHistoryDB` (`backend/db/schemas.py`)
 *
 * Every persisted field is optional on the backend, so these types keep the
 * nullability intact instead of pretending values are always present. All three
 * endpoints are pure reads: they never submit a claim or run ML inference.
 */

/** `GET /api/v1/claims/{claim_id}` — persisted claim details. */
export interface ClaimDetails {
  claim_id: string | null
  policy_id: string | null
  /** ISO-8601 timestamp string, or null when the record predates the column. */
  created_at: string | null
  policy_state: string | null
  claim_amount: number | null
  incident_type: string | null
  incident_date: string | null
}

/**
 * `GET /api/v1/analyses/{analysis_id}` — a previously saved analysis.
 *
 * Nested sections mirror the analyzer's response shape, but the saved-analysis
 * contract differs from the submission response: `explanation` and `decision`
 * may be null (they are stored JSON columns) and `risk.components` is stored
 * only inside the explanation. The types are intentionally kept separate from
 * `ClaimAnalysisResponse` so neither contract is forced onto the other.
 */
export interface SavedAnalysisFraud {
  probability: number | null
}

export interface SavedAnalysisSeverity {
  predicted_claim_amount: number | null
}

export interface SavedAnalysisAnomaly {
  score: number | null
}

export interface SavedAnalysisRisk {
  score: number | null
  level: string | null
  components: Record<string, unknown> | null
}

export interface SavedAnalysis {
  analysis_id: string | null
  claim_id: string | null
  /** ISO-8601 timestamp string, or null when not recorded. */
  analyzed_at: string | null
  fraud: SavedAnalysisFraud
  severity: SavedAnalysisSeverity
  anomaly: SavedAnalysisAnomaly
  risk: SavedAnalysisRisk
  explanation: Record<string, unknown> | null
  decision: Record<string, unknown> | null
}

/** One lightweight row from the analysis history list. */
export interface AnalysisHistoryItem {
  analysis_id: string | null
  analyzed_at: string | null
  fraud_probability: number | null
  predicted_claim_amount: number | null
  anomaly_score: number | null
  risk_score: number | null
  risk_level: string | null
  recommendation: string | null
}

/**
 * `GET /api/v1/claims/{claim_id}/analyses` — a page of analysis summaries.
 *
 * `total` is the full number of analyses for the claim, not the page size.
 */
export interface AnalysisHistoryPage {
  items: AnalysisHistoryItem[]
  total: number
  limit: number
  offset: number
}

export type AnalysisHistoryOrder = 'asc' | 'desc'

/** Query parameters accepted by the history endpoint. */
export interface AnalysisHistoryQuery {
  limit?: number
  offset?: number
  order?: AnalysisHistoryOrder
}

/** History query parameters combined with the shared request options. */
export type AnalysisHistoryOptions = AnalysisHistoryQuery & RequestOptions

/** Backend defaults, mirrored so callers can omit the parameters. */
export const DEFAULT_HISTORY_LIMIT = 20
export const DEFAULT_HISTORY_OFFSET = 0
export const DEFAULT_HISTORY_ORDER: AnalysisHistoryOrder = 'desc'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

/** Accept an object, or `null`/`undefined` (preserved as null). */
function readNullableRecord(
  value: unknown,
  field: string,
): Record<string, unknown> | null {
  if (value === null || value === undefined) return null
  if (!isRecord(value)) {
    throw new ApiError('parse', `Response field "${field}" was not an object`)
  }
  return value
}

/** Accept a non-negative integer (used for `total`, `limit`, `offset`). */
function readCount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ApiError('parse', `Response field "${field}" was not a count`)
  }
  return value
}

/** Validate a raw `GET /claims/{claim_id}` payload. */
export function parseClaimDetails(value: unknown): ClaimDetails {
  if (!isRecord(value)) {
    throw new ApiError('parse', 'Claim response was not a JSON object')
  }
  return {
    claim_id: readNullableString(value.claim_id, 'claim_id'),
    policy_id: readNullableString(value.policy_id, 'policy_id'),
    created_at: readNullableString(value.created_at, 'created_at'),
    policy_state: readNullableString(value.policy_state, 'policy_state'),
    claim_amount: readNullableNumber(value.claim_amount, 'claim_amount'),
    incident_type: readNullableString(value.incident_type, 'incident_type'),
    incident_date: readNullableString(value.incident_date, 'incident_date'),
  }
}

function parseSavedAnalysisFraud(value: unknown): SavedAnalysisFraud {
  if (!isRecord(value)) {
    throw new ApiError('parse', 'Saved analysis was missing the "fraud" section')
  }
  return { probability: readNullableNumber(value.probability, 'fraud.probability') }
}

function parseSavedAnalysisSeverity(value: unknown): SavedAnalysisSeverity {
  if (!isRecord(value)) {
    throw new ApiError('parse', 'Saved analysis was missing the "severity" section')
  }
  return {
    predicted_claim_amount: readNullableNumber(
      value.predicted_claim_amount,
      'severity.predicted_claim_amount',
    ),
  }
}

function parseSavedAnalysisAnomaly(value: unknown): SavedAnalysisAnomaly {
  if (!isRecord(value)) {
    throw new ApiError('parse', 'Saved analysis was missing the "anomaly" section')
  }
  return { score: readNullableNumber(value.score, 'anomaly.score') }
}

function parseSavedAnalysisRisk(value: unknown): SavedAnalysisRisk {
  if (!isRecord(value)) {
    throw new ApiError('parse', 'Saved analysis was missing the "risk" section')
  }
  return {
    score: readNullableNumber(value.score, 'risk.score'),
    level: readNullableString(value.level, 'risk.level'),
    components: readNullableRecord(value.components, 'risk.components'),
  }
}

/** Validate a raw `GET /analyses/{analysis_id}` payload. */
export function parseSavedAnalysis(value: unknown): SavedAnalysis {
  if (!isRecord(value)) {
    throw new ApiError('parse', 'Analysis response was not a JSON object')
  }
  return {
    analysis_id: readNullableString(value.analysis_id, 'analysis_id'),
    claim_id: readNullableString(value.claim_id, 'claim_id'),
    analyzed_at: readNullableString(value.analyzed_at, 'analyzed_at'),
    fraud: parseSavedAnalysisFraud(value.fraud),
    severity: parseSavedAnalysisSeverity(value.severity),
    anomaly: parseSavedAnalysisAnomaly(value.anomaly),
    risk: parseSavedAnalysisRisk(value.risk),
    explanation: readNullableRecord(value.explanation, 'explanation'),
    decision: readNullableRecord(value.decision, 'decision'),
  }
}

function parseAnalysisHistoryItem(
  value: unknown,
  index: number,
): AnalysisHistoryItem {
  if (!isRecord(value)) {
    throw new ApiError('parse', `History item ${index} was not an object`)
  }
  return {
    analysis_id: readNullableString(value.analysis_id, 'analysis_id'),
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

/** Validate a raw `GET /claims/{claim_id}/analyses` payload. */
export function parseAnalysisHistoryPage(value: unknown): AnalysisHistoryPage {
  if (!isRecord(value)) {
    throw new ApiError('parse', 'History response was not a JSON object')
  }
  const items = value.items
  if (!Array.isArray(items)) {
    throw new ApiError('parse', 'History response was missing the "items" list')
  }
  return {
    items: items.map((item, index) => parseAnalysisHistoryItem(item, index)),
    total: readCount(value.total, 'total'),
    limit: readCount(value.limit, 'limit'),
    offset: readCount(value.offset, 'offset'),
  }
}

/** Build a single, safely encoded path segment for a claim identifier. */
function claimPath(claimId: string): string {
  return `${API_V1_PREFIX}/claims/${encodeURIComponent(claimId)}`
}

/** Build a single, safely encoded path segment for an analysis identifier. */
function analysisPath(analysisId: string): string {
  return `${API_V1_PREFIX}/analyses/${encodeURIComponent(analysisId)}`
}

/**
 * Fetch persisted details for a claim. Rejects with a typed `ApiError` on
 * failure; a 404 stays an `ApiError` (`kind: 'http'`, `status: 404`) rather than
 * being converted into an empty result.
 */
export async function getClaimById(
  claimId: string,
  options: RequestOptions = {},
): Promise<ClaimDetails> {
  const payload = await requestJson(claimPath(claimId), options)
  return parseClaimDetails(payload)
}

/**
 * Fetch a previously saved analysis by id. This never submits a new claim or
 * invokes ML inference; it reads the stored record only.
 */
export async function getAnalysisById(
  analysisId: string,
  options: RequestOptions = {},
): Promise<SavedAnalysis> {
  const payload = await requestJson(analysisPath(analysisId), options)
  return parseSavedAnalysis(payload)
}

/**
 * Fetch a page of analysis summaries for a claim, newest first by default.
 *
 * Defaults mirror the backend: `limit=20`, `offset=0`, `order=desc`. The
 * parameters are always serialised so the request is deterministic.
 */
export async function getClaimAnalysisHistory(
  claimId: string,
  options: AnalysisHistoryOptions = {},
): Promise<AnalysisHistoryPage> {
  const { limit, offset, order, ...requestOptions } = options
  const query = new URLSearchParams({
    limit: String(limit ?? DEFAULT_HISTORY_LIMIT),
    offset: String(offset ?? DEFAULT_HISTORY_OFFSET),
    order: order ?? DEFAULT_HISTORY_ORDER,
  })
  const path = `${claimPath(claimId)}/analyses?${query.toString()}`
  const payload = await requestJson(path, requestOptions)
  return parseAnalysisHistoryPage(payload)
}
