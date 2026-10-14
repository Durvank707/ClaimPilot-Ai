import { requestJson, type RequestOptions } from './client'
import { API_V1_PREFIX } from './config'
import { ApiError, describeApiError, isApiError } from './errors'

/**
 * Claim submission, mirroring the real backend contract
 * (`backend/schemas.py` + `backend/routers/claims.py`).
 *
 * Request: `POST /api/v1/claims/analyze` with a `ClaimRequest` body. Every field
 * is optional on the backend (`Optional[...] = None`); the route drops `None`
 * values (`model_dump(exclude_none=True)`).
 *
 * Response: validated through `response_model=ClaimResponse`, which declares
 * exactly the fields below. The route also returns the persistence metadata
 * `analysis_id` (the stored analysis UUID, or `null` when persistence did not
 * happen) and `persisted` (whether the claim and analysis were committed
 * together). `claim_id` mirrors the submitted `policy_id` (or `null`).
 */
export interface ClaimRequest {
  policy_id?: string
  policy_state?: string
  policy_deductible?: number
  policy_annual_premium?: number
  insured_age?: number
  insured_sex?: string
  insured_education_level?: string
  insured_occupation?: string
  incident_date?: string
  incident_type?: string
  collision_type?: string
  incident_severity?: string
  authorities_contacted?: string
  incident_state?: string
  incident_city?: string
  incident_hour_of_the_day?: number
  number_of_vehicles_involved?: number
  bodily_injuries?: number
  witnesses?: number
  police_report_available?: string
  claim_amount?: number
}

/** Analysis sections returned by the backend. Shapes are model-owned. */
export interface ClaimAnalysisResponse {
  claim_id: string | null
  fraud: Record<string, unknown>
  severity: Record<string, unknown>
  anomaly: Record<string, unknown>
  risk: Record<string, unknown>
  explanation: Record<string, unknown>
  decision: Record<string, unknown>
  /**
   * UUID of the stored analysis record, or `null` when persistence failed.
   * Never used on its own to infer that data was saved.
   */
  analysis_id: string | null
  /**
   * The backend's own statement of whether the claim and analysis were
   * committed together. A successful ML analysis can still be `false`; this is
   * never inferred from `analysis_id`.
   */
  persisted: boolean
}

/**
 * Model inference reads the training CSV on each request, so claim analysis can
 * legitimately take longer than a health probe. This is still a bounded,
 * user-facing timeout, not an unbounded wait.
 */
export const SUBMIT_TIMEOUT_MS = 30_000

const ANALYZE_PATH = `${API_V1_PREFIX}/claims/analyze`

const REQUIRED_SECTIONS = [
  'fraud',
  'severity',
  'anomaly',
  'risk',
  'explanation',
  'decision',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Accept a string, or `null`/`undefined` (preserved as null); reject the rest. */
function readNullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') {
    throw new ApiError('parse', `Analysis response had an invalid ${field}`)
  }
  return value
}

/**
 * Accept a boolean. The flag is authoritative, so anything else — including a
 * missing value — is a malformed response and raises a typed parse error rather
 * than being coerced into a persistence claim.
 */
function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ApiError('parse', `Analysis response had an invalid ${field}`)
  }
  return value
}

/** Validate a raw analyze payload before trusting it. */
export function parseClaimAnalysisResponse(
  value: unknown,
): ClaimAnalysisResponse {
  if (!isRecord(value)) {
    throw new ApiError(
      'parse',
      'Analysis response was not a JSON object',
    )
  }

  const claimId = value.claim_id
  if (claimId !== null && claimId !== undefined && typeof claimId !== 'string') {
    throw new ApiError('parse', 'Analysis response had an invalid claim_id')
  }

  for (const section of REQUIRED_SECTIONS) {
    if (!isRecord(value[section])) {
      throw new ApiError(
        'parse',
        `Analysis response was missing the "${section}" section`,
      )
    }
  }

  return {
    claim_id: (claimId as string | null | undefined) ?? null,
    fraud: value.fraud as Record<string, unknown>,
    severity: value.severity as Record<string, unknown>,
    anomaly: value.anomaly as Record<string, unknown>,
    risk: value.risk as Record<string, unknown>,
    explanation: value.explanation as Record<string, unknown>,
    decision: value.decision as Record<string, unknown>,
    analysis_id: readNullableString(value.analysis_id, 'analysis_id'),
    persisted: readBoolean(value.persisted, 'persisted flag'),
  }
}

/** Submit a claim for analysis. Throws `ApiError` on any failure. */
export async function submitClaim(
  request: ClaimRequest,
  options: RequestOptions = {},
): Promise<ClaimAnalysisResponse> {
  const payload = await requestJson(ANALYZE_PATH, {
    ...options,
    method: 'POST',
    body: request,
    timeoutMs: options.timeoutMs ?? SUBMIT_TIMEOUT_MS,
  })
  return parseClaimAnalysisResponse(payload)
}

/** Known request field names, used to map FastAPI validation errors to inputs. */
const CLAIM_REQUEST_FIELDS = new Set<string>([
  'policy_id',
  'policy_state',
  'policy_deductible',
  'policy_annual_premium',
  'insured_age',
  'insured_sex',
  'insured_education_level',
  'insured_occupation',
  'incident_date',
  'incident_type',
  'collision_type',
  'incident_severity',
  'authorities_contacted',
  'incident_state',
  'incident_city',
  'incident_hour_of_the_day',
  'number_of_vehicles_involved',
  'bodily_injuries',
  'witnesses',
  'police_report_available',
  'claim_amount',
])

export interface SubmitErrorInfo {
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
}

/**
 * Translate any submission failure into safe, user-facing wording.
 *
 * FastAPI validation errors (`{"detail": [{"loc": [...], "msg": ...}]}`) are
 * mapped onto the offending fields. Everything else falls back to the generic
 * `describeApiError` wording, so raw bodies and stack traces are never shown.
 */
export function describeSubmitError(error: unknown): SubmitErrorInfo {
  if (isApiError(error)) {
    const uncertain = error.kind === 'timeout' || error.kind === 'network'

    const fieldErrors = extractValidationErrors(error.details)
    if (Object.keys(fieldErrors).length > 0) {
      return {
        message: 'The server rejected some of the submitted claim data.',
        fieldErrors,
        uncertain,
      }
    }

    return { message: describeApiError(error), fieldErrors: {}, uncertain }
  }

  return {
    message: 'An unexpected error occurred while submitting the claim.',
    fieldErrors: {},
    uncertain: false,
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

    // `loc` is like ["body", "claim_amount"]; the last string is the field.
    const last = [...loc].reverse().find((part) => typeof part === 'string')
    if (typeof last !== 'string') continue

    if (!CLAIM_REQUEST_FIELDS.has(last)) continue
    result[last] = msg
  }

  return result
}
