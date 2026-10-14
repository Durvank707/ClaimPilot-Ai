import type { ClaimRequest } from '../../api/claims'
import { CLAIM_FIELDS, apiValueType, type ClaimFormValues } from './claimForm'

/**
 * Convert form string values into the backend `ClaimRequest` payload.
 *
 * - Field names are the exact backend names (the form contract guarantees this).
 * - The value type of each field comes from `apiValueType`, which mirrors the
 *   backend schema (note `policy_deductible` is numeric even though the UI
 *   renders it as a select).
 * - Empty optional fields are omitted rather than sent as `""`, matching the
 *   backend's `exclude_none=True` handling. No populated field is dropped, and
 *   no missing value is silently substituted.
 */
export function toClaimRequest(values: ClaimFormValues): ClaimRequest {
  const payload: Record<string, string | number> = {}

  for (const field of CLAIM_FIELDS) {
    const raw = (values[field.name] ?? '').trim()
    if (raw === '') continue

    const type = apiValueType(field.name)
    if (type === 'integer') {
      payload[field.name] = Number.parseInt(raw, 10)
    } else if (type === 'decimal') {
      payload[field.name] = Number.parseFloat(raw)
    } else {
      payload[field.name] = raw
    }
  }

  return payload as ClaimRequest
}
