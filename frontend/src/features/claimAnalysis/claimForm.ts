/**
 * Claim form contract.
 *
 * This module is the single source of truth for the New Claim Analysis form.
 * Every field name matches `backend/schemas.py :: ClaimRequest` exactly, and
 * categorical options are the values present in the training data the models
 * were fitted on (`data/processed/processed_all.csv` -> `src/claimpilot/features/sets.py`).
 *
 * There is no form library here on purpose: the contract is small and static,
 * and a plain typed module keeps the form dependency-free and easy to test.
 */

/** Exact request field names from `backend/schemas.py :: ClaimRequest`. */
export type ClaimFieldName =
  | 'policy_id'
  | 'policy_state'
  | 'policy_deductible'
  | 'policy_annual_premium'
  | 'insured_age'
  | 'insured_sex'
  | 'insured_education_level'
  | 'insured_occupation'
  | 'incident_date'
  | 'incident_type'
  | 'collision_type'
  | 'incident_severity'
  | 'authorities_contacted'
  | 'incident_state'
  | 'incident_city'
  | 'incident_hour_of_the_day'
  | 'number_of_vehicles_involved'
  | 'bodily_injuries'
  | 'witnesses'
  | 'police_report_available'
  | 'claim_amount'

/**
 * The API schema marks every field optional, so the request itself accepts an
 * empty body. The form adopts the project's own data contract to decide which
 * fields are required for a meaningful analysis: `claimpilot/data/validators.py`
 * lists `REQUIRED_COLUMNS = [policy_id, fraud_reported, claim_amount, incident_date]`.
 * `fraud_reported` is the label (not an input), so the required *inputs* are the
 * three below. Everything else stays optional, matching the API schema.
 */
export const REQUIRED_FIELD_NAMES: readonly ClaimFieldName[] = [
  'policy_id',
  'incident_date',
  'claim_amount',
]

/** Accepted policy / incident state codes present in the training data. */
export const STATE_CODES = [
  'CA',
  'FL',
  'GA',
  'IL',
  'MI',
  'NC',
  'NY',
  'OH',
  'PA',
  'TX',
] as const

/** Discrete deductible amounts present in the training data. */
export const POLICY_DEDUCTIBLES = [
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '1000',
] as const

export const INSURED_SEXES = ['FEMALE', 'MALE', 'OTHER'] as const

export const EDUCATION_LEVELS = [
  'College',
  'High School',
  'Masters',
  'PhD',
] as const

export const OCCUPATIONS = [
  'Clerk',
  'Doctor',
  'Engineer',
  'Lawyer',
  'Manager',
  'Sales',
  'Teacher',
  'Technician',
] as const

export const INCIDENT_TYPES = [
  'Multi-vehicle Collision',
  'Parked Car',
  'Single Vehicle Collision',
  'Vehicle Theft',
] as const

export const COLLISION_TYPES = ['Front', 'Rear', 'Side', 'Unknown'] as const

export const INCIDENT_SEVERITIES = [
  'Major Damage',
  'Minor Damage',
  'Total Loss',
] as const

export const AUTHORITIES = ['Ambulance', 'Fire', 'Police', 'Unknown'] as const

export const POLICE_REPORT = ['Yes', 'No'] as const

/** Control type driven by the backend field type. */
export type ClaimFieldKind = 'text' | 'integer' | 'decimal' | 'select' | 'date'

export type ClaimSectionId = 'policy' | 'insured' | 'incident' | 'claim'

export interface ClaimSection {
  id: ClaimSectionId
  title: string
  description: string
}

export const CLAIM_SECTIONS: readonly ClaimSection[] = [
  {
    id: 'policy',
    title: 'Policy Information',
    description: 'Details of the policy the claim is filed under.',
  },
  {
    id: 'insured',
    title: 'Insured Person',
    description: 'Who the policy covers.',
  },
  {
    id: 'incident',
    title: 'Incident Details',
    description: 'What happened, where, and when.',
  },
  {
    id: 'claim',
    title: 'Claim Information',
    description: 'The amount being claimed.',
  },
]

export interface ClaimField {
  /** Backend field name; used as the input `name` and the payload key. */
  name: ClaimFieldName
  label: string
  kind: ClaimFieldKind
  section: ClaimSectionId
  /** Required for a meaningful analysis (see REQUIRED_FIELD_NAMES). */
  required?: boolean
  /** Allowed values for `select` fields; the only accepted inputs. */
  options?: readonly string[]
  /** Inclusive lower bound. Only set where logically/numerically invalid below it. */
  min?: number
  /** Inclusive upper bound. Only set where documented (e.g. hour 0-23). */
  max?: number
  step?: number | 'any'
  inputMode?: 'numeric' | 'decimal'
  hint?: string
  placeholder?: string
}

/**
 * Field definitions in the order they are rendered. The order also defines the
 * "first invalid field" used for focus management.
 */
export const CLAIM_FIELDS: readonly ClaimField[] = [
  // --- Policy Information -------------------------------------------------
  {
    name: 'policy_id',
    label: 'Policy ID',
    kind: 'text',
    section: 'policy',
    required: true,
    hint: 'Policy identifier from the claim file. Used to trace the claim.',
    placeholder: 'e.g. P123456',
  },
  {
    name: 'policy_state',
    label: 'Policy state',
    kind: 'select',
    section: 'policy',
    options: STATE_CODES,
    hint: 'US state where the policy was issued.',
  },
  {
    name: 'policy_deductible',
    label: 'Policy deductible',
    kind: 'select',
    section: 'policy',
    options: POLICY_DEDUCTIBLES,
    hint: 'Deductible amount in USD. Discrete values used by the model.',
  },
  {
    name: 'policy_annual_premium',
    label: 'Annual premium',
    kind: 'decimal',
    section: 'policy',
    min: 0,
    step: 'any',
    inputMode: 'decimal',
    hint: 'Annual premium in USD. Training data ranged 600–1,500.',
    placeholder: 'e.g. 1200.50',
  },

  // --- Insured Person -----------------------------------------------------
  {
    name: 'insured_age',
    label: 'Age',
    kind: 'integer',
    section: 'insured',
    min: 0,
    step: 1,
    inputMode: 'numeric',
    hint: 'Age of the insured person in years. Training data ranged 18–75.',
    placeholder: 'e.g. 42',
  },
  {
    name: 'insured_sex',
    label: 'Sex',
    kind: 'select',
    section: 'insured',
    options: INSURED_SEXES,
  },
  {
    name: 'insured_education_level',
    label: 'Education level',
    kind: 'select',
    section: 'insured',
    options: EDUCATION_LEVELS,
  },
  {
    name: 'insured_occupation',
    label: 'Occupation',
    kind: 'select',
    section: 'insured',
    options: OCCUPATIONS,
  },

  // --- Incident Details ---------------------------------------------------
  {
    name: 'incident_date',
    label: 'Incident date',
    kind: 'date',
    section: 'incident',
    required: true,
    hint: 'Date the incident occurred (YYYY-MM-DD).',
  },
  {
    name: 'incident_type',
    label: 'Incident type',
    kind: 'select',
    section: 'incident',
    options: INCIDENT_TYPES,
  },
  {
    name: 'collision_type',
    label: 'Collision type',
    kind: 'select',
    section: 'incident',
    options: COLLISION_TYPES,
    hint: 'Point of impact, or Unknown if not recorded.',
  },
  {
    name: 'incident_severity',
    label: 'Incident severity',
    kind: 'select',
    section: 'incident',
    options: INCIDENT_SEVERITIES,
  },
  {
    name: 'authorities_contacted',
    label: 'Authorities contacted',
    kind: 'select',
    section: 'incident',
    options: AUTHORITIES,
    hint: 'Which authority attended, or Unknown.',
  },
  {
    name: 'incident_state',
    label: 'Incident state',
    kind: 'select',
    section: 'incident',
    options: STATE_CODES,
    hint: 'US state where the incident occurred.',
  },
  {
    name: 'incident_city',
    label: 'Incident city',
    kind: 'text',
    section: 'incident',
    hint: 'Free text. The dataset lists many city names, so this is not a fixed list.',
    placeholder: 'e.g. Springfield',
  },
  {
    name: 'incident_hour_of_the_day',
    label: 'Incident hour',
    kind: 'integer',
    section: 'incident',
    min: 0,
    max: 23,
    step: 1,
    inputMode: 'numeric',
    hint: 'Hour of day on a 24-hour clock (0–23).',
    placeholder: 'e.g. 14',
  },
  {
    name: 'number_of_vehicles_involved',
    label: 'Vehicles involved',
    kind: 'integer',
    section: 'incident',
    min: 0,
    step: 1,
    inputMode: 'numeric',
    hint: 'Total number of vehicles involved. Training data ranged 1–4.',
    placeholder: 'e.g. 2',
  },
  {
    name: 'bodily_injuries',
    label: 'Bodily injuries',
    kind: 'integer',
    section: 'incident',
    min: 0,
    step: 1,
    inputMode: 'numeric',
    hint: 'Number of people with bodily injuries. Training data ranged 0–4.',
    placeholder: 'e.g. 0',
  },
  {
    name: 'witnesses',
    label: 'Witnesses',
    kind: 'integer',
    section: 'incident',
    min: 0,
    step: 1,
    inputMode: 'numeric',
    hint: 'Number of witnesses. Training data ranged 0–5.',
    placeholder: 'e.g. 1',
  },
  {
    name: 'police_report_available',
    label: 'Police report available',
    kind: 'select',
    section: 'incident',
    options: POLICE_REPORT,
  },

  // --- Claim Information --------------------------------------------------
  {
    name: 'claim_amount',
    label: 'Claim amount',
    kind: 'decimal',
    section: 'claim',
    required: true,
    min: 0,
    step: 'any',
    inputMode: 'decimal',
    hint: 'Amount claimed in USD. Must not be negative.',
    placeholder: 'e.g. 18500',
  },
]

/** Form values are kept as strings (the raw control values). */
export type ClaimFormValues = Record<ClaimFieldName, string>

export type ClaimFormErrors = Partial<Record<ClaimFieldName, string>>

export const EMPTY_CLAIM_FORM: ClaimFormValues = Object.freeze(
  Object.fromEntries(
    Object.keys(
      CLAIM_FIELDS.reduce<Record<string, true>>((acc, f) => {
        acc[f.name] = true
        return acc
      }, {}),
    ).map((name) => [name, '']),
  ) as ClaimFormValues,
)

export function fieldsForSection(section: ClaimSectionId): ClaimField[] {
  return CLAIM_FIELDS.filter((field) => field.section === section)
}

export type ClaimApiValueType = 'string' | 'integer' | 'decimal'

/**
 * The JSON type each field must have in the request payload, per the backend
 * `ClaimRequest` schema. This is deliberately separate from the control `kind`:
 * `policy_deductible` is an integer on the backend but a `<select>` in the UI
 * (its observed values are discrete), so it must still be sent as a number.
 */
const API_VALUE_TYPES: Partial<
  Record<ClaimFieldName, Exclude<ClaimApiValueType, 'string'>>
> = {
  policy_deductible: 'integer',
  policy_annual_premium: 'decimal',
  insured_age: 'integer',
  incident_hour_of_the_day: 'integer',
  number_of_vehicles_involved: 'integer',
  bodily_injuries: 'integer',
  witnesses: 'integer',
  claim_amount: 'decimal',
}

export function apiValueType(name: ClaimFieldName): ClaimApiValueType {
  return API_VALUE_TYPES[name] ?? 'string'
}
