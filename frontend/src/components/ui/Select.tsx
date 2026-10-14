import type { SelectHTMLAttributes } from 'react'
import { fieldClassName } from '../../lib/formStyles'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
  /** Allowed values. The only accepted inputs for a categorical field. */
  options: readonly string[]
  /** Label for the empty first option (the "no value provided" choice). */
  placeholder?: string
}

/**
 * Accessible native <select> for categorical fields. Options come from the
 * backend/data contract, so an officer can only choose values the model accepts.
 */
export function Select({
  invalid,
  options,
  placeholder = 'Select…',
  className,
  ...props
}: SelectProps) {
  return (
    <select
      className={fieldClassName(invalid, className)}
      aria-invalid={invalid || undefined}
      {...props}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  )
}
