import {
  CLAIM_FIELDS,
  type ClaimField,
  type ClaimFormErrors,
  type ClaimFormValues,
} from './claimForm'

/** `YYYY-MM-DD` only, and only if it is a real calendar date. */
export function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

const INTEGER_PATTERN = /^-?\d+$/
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/

function validateField(
  field: ClaimField,
  rawValue: string,
): string | undefined {
  const value = rawValue.trim()

  if (value === '') {
    // Missing values are allowed unless the field is required. A missing value
    // is never silently replaced with a default.
    return field.required ? `${field.label} is required.` : undefined
  }

  switch (field.kind) {
    case 'select':
      if (!field.options?.includes(value)) {
        return `Select a valid ${field.label.toLowerCase()}.`
      }
      return undefined

    case 'integer': {
      if (!INTEGER_PATTERN.test(value)) {
        return `${field.label} must be a whole number.`
      }
      return rangeError(field, Number(value))
    }

    case 'decimal': {
      if (!DECIMAL_PATTERN.test(value)) {
        return `${field.label} must be a number.`
      }
      return rangeError(field, Number(value))
    }

    case 'date':
      return isValidIsoDate(value)
        ? undefined
        : `${field.label} must be a valid date in YYYY-MM-DD format.`

    case 'text':
      return undefined
  }
}

function rangeError(field: ClaimField, value: number): string | undefined {
  if (field.min !== undefined && value < field.min) {
    return `${field.label} must be ${field.min} or more.`
  }
  if (field.max !== undefined && value > field.max) {
    return `${field.label} must be ${field.max} or less.`
  }
  return undefined
}

/**
 * Validate the whole form. Returns a map of `fieldName -> message`; an empty
 * object means the form is valid. Missing optional fields are left empty rather
 * than substituted with a default.
 */
export function validateClaimForm(values: ClaimFormValues): ClaimFormErrors {
  const errors: ClaimFormErrors = {}
  for (const field of CLAIM_FIELDS) {
    const error = validateField(field, values[field.name] ?? '')
    if (error) errors[field.name] = error
  }
  return errors
}

export function countErrors(errors: ClaimFormErrors): number {
  return Object.keys(errors).length
}

/** The first invalid field in render order, for focus management. */
export function firstInvalidField(
  errors: ClaimFormErrors,
): ClaimField | undefined {
  return CLAIM_FIELDS.find((field) => errors[field.name] !== undefined)
}
