import { describe, expect, it } from 'vitest'
import { EMPTY_CLAIM_FORM, type ClaimFormValues } from './claimForm'
import {
  countErrors,
  firstInvalidField,
  isValidIsoDate,
  validateClaimForm,
} from './validateClaimForm'

/** A minimal form that satisfies the required fields only. */
function validValues(overrides: Partial<ClaimFormValues> = {}): ClaimFormValues {
  return {
    ...EMPTY_CLAIM_FORM,
    policy_id: 'P-100200',
    incident_date: '2024-05-01',
    claim_amount: '18500',
    ...overrides,
  }
}

describe('validateClaimForm', () => {
  it('accepts a form with only the required fields filled', () => {
    expect(validateClaimForm(validValues())).toEqual({})
  })

  it('accepts a fully populated, valid form', () => {
    const values: ClaimFormValues = {
      policy_id: 'P-100200',
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
      claim_amount: '18500',
    }
    expect(validateClaimForm(values)).toEqual({})
  })

  it('requires policy_id, incident_date and claim_amount', () => {
    const errors = validateClaimForm(EMPTY_CLAIM_FORM)
    expect(errors.policy_id).toBe('Policy ID is required.')
    expect(errors.incident_date).toBe('Incident date is required.')
    expect(errors.claim_amount).toBe('Claim amount is required.')
    // Optional fields are not required by the API schema.
    expect(errors.insured_sex).toBeUndefined()
    expect(errors.incident_city).toBeUndefined()
    expect(countErrors(errors)).toBe(3)
    expect(firstInvalidField(errors)?.name).toBe('policy_id')
  })

  it('treats whitespace-only required values as missing', () => {
    const errors = validateClaimForm(validValues({ policy_id: '   ' }))
    expect(errors.policy_id).toBe('Policy ID is required.')
  })

  it('rejects a non-numeric claim amount', () => {
    expect(validateClaimForm(validValues({ claim_amount: 'abc' })).claim_amount)
      .toBe('Claim amount must be a number.')
  })

  it('rejects a negative claim amount', () => {
    expect(validateClaimForm(validValues({ claim_amount: '-1' })).claim_amount)
      .toBe('Claim amount must be 0 or more.')
  })

  it('rejects a decimal value for an integer field', () => {
    expect(validateClaimForm(validValues({ insured_age: '42.5' })).insured_age)
      .toBe('Age must be a whole number.')
  })

  it('rejects an hour outside the documented 0-23 range', () => {
    expect(
      validateClaimForm(validValues({ incident_hour_of_the_day: '24' }))
        .incident_hour_of_the_day,
    ).toBe('Incident hour must be 23 or less.')
    expect(
      validateClaimForm(validValues({ incident_hour_of_the_day: '-1' }))
        .incident_hour_of_the_day,
    ).toBe('Incident hour must be 0 or more.')
  })

  it('rejects a categorical value that is not accepted by the model', () => {
    expect(
      validateClaimForm(validValues({ insured_sex: 'ROBOT' })).insured_sex,
    ).toBe('Select a valid sex.')
  })

  it('rejects a malformed or impossible incident date', () => {
    expect(
      validateClaimForm(validValues({ incident_date: '01/05/2024' }))
        .incident_date,
    ).toBe('Incident date must be a valid date in YYYY-MM-DD format.')
    expect(
      validateClaimForm(validValues({ incident_date: '2024-02-30' }))
        .incident_date,
    ).toBe('Incident date must be a valid date in YYYY-MM-DD format.')
  })
})

describe('isValidIsoDate', () => {
  it('accepts real calendar dates', () => {
    expect(isValidIsoDate('2024-05-01')).toBe(true)
    expect(isValidIsoDate('2024-02-29')).toBe(true) // leap year
  })

  it('rejects wrong formats and impossible dates', () => {
    expect(isValidIsoDate('2023-02-29')).toBe(false)
    expect(isValidIsoDate('2024-13-01')).toBe(false)
    expect(isValidIsoDate('2024-5-1')).toBe(false)
    expect(isValidIsoDate('')).toBe(false)
  })
})
