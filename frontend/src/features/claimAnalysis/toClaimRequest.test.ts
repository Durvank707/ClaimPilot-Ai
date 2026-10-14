import { describe, expect, it } from 'vitest'
import { EMPTY_CLAIM_FORM, type ClaimFormValues } from './claimForm'
import { toClaimRequest } from './toClaimRequest'

describe('toClaimRequest', () => {
  it('produces an empty payload when nothing is entered', () => {
    expect(toClaimRequest(EMPTY_CLAIM_FORM)).toEqual({})
  })

  it('omits optional fields left blank instead of sending empty strings', () => {
    const payload = toClaimRequest({
      ...EMPTY_CLAIM_FORM,
      policy_id: 'POLICY-42',
      incident_date: '2024-05-01',
      claim_amount: '18500',
    })

    expect(payload).toEqual({
      policy_id: 'POLICY-42',
      incident_date: '2024-05-01',
      claim_amount: 18500,
    })
    expect(Object.values(payload)).not.toContain('')
  })

  it('converts numeric fields to numbers and keeps text fields as strings', () => {
    const values: ClaimFormValues = {
      ...EMPTY_CLAIM_FORM,
      policy_id: 'POLICY-42',
      policy_state: 'GA',
      policy_deductible: '500',
      policy_annual_premium: '1200.50',
      insured_age: '42',
      insured_sex: 'MALE',
      insured_education_level: 'College',
      insured_occupation: 'Engineer',
      incident_date: '2024-05-01',
      incident_type: 'Single Vehicle Collision',
      collision_type: 'Front',
      incident_severity: 'Minor Damage',
      authorities_contacted: 'Police',
      incident_state: 'GA',
      incident_city: 'Springfield',
      incident_hour_of_the_day: '14',
      number_of_vehicles_involved: '2',
      bodily_injuries: '0',
      witnesses: '1',
      police_report_available: 'Yes',
      claim_amount: '18500.55',
    }

    const payload = toClaimRequest(values)

    // Every populated field is present — none is silently dropped.
    expect(Object.keys(payload).sort()).toEqual(Object.keys(values).sort())

    // Types match the backend ClaimRequest schema.
    expect(payload.policy_deductible).toBe(500)
    expect(payload.policy_annual_premium).toBe(1200.5)
    expect(payload.insured_age).toBe(42)
    expect(payload.incident_hour_of_the_day).toBe(14)
    expect(payload.number_of_vehicles_involved).toBe(2)
    expect(payload.bodily_injuries).toBe(0)
    expect(payload.witnesses).toBe(1)
    expect(payload.claim_amount).toBe(18500.55)
    expect(payload.policy_state).toBe('GA')
    expect(payload.insured_sex).toBe('MALE')
    expect(payload.incident_city).toBe('Springfield')
  })

  it('does not include UI-only properties', () => {
    const payload = toClaimRequest({
      ...EMPTY_CLAIM_FORM,
      policy_id: 'POLICY-42',
    }) as Record<string, unknown>

    expect(payload.id).toBeUndefined()
    expect(payload.analysis_id).toBeUndefined()
    expect(payload.submit).toBeUndefined()
    expect(Object.keys(payload)).toEqual(['policy_id'])
  })
})
