import type { ChangeEvent } from 'react'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import type { ClaimField, ClaimFieldName } from './claimForm'

export interface ClaimFieldInputProps {
  field: ClaimField
  value: string
  error?: string
  onChange: (name: ClaimFieldName, value: string) => void
}

/**
 * Renders one claim field: an accessible label (via FormField), helper text,
 * an inline error message, and the matching native control for the field kind.
 */
export function ClaimFieldInput({
  field,
  value,
  error,
  onChange,
}: ClaimFieldInputProps) {
  return (
    <FormField
      label={field.label}
      hint={field.hint}
      error={error}
      required={field.required}
    >
      {({ id, describedBy, invalid }) => {
        const common = {
          id,
          name: field.name,
          value,
          'aria-describedby': describedBy,
          onChange: (
            event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
          ) => onChange(field.name, event.target.value),
        }

        if (field.kind === 'select') {
          return (
            <Select
              {...common}
              options={field.options ?? []}
              invalid={invalid}
              placeholder={`Select ${field.label.toLowerCase()}`}
            />
          )
        }

        const type =
          field.kind === 'date'
            ? 'date'
            : field.kind === 'text'
              ? 'text'
              : 'number'

        return (
          <Input
            {...common}
            type={type}
            invalid={invalid}
            inputMode={field.inputMode}
            min={field.min}
            max={field.max}
            step={field.step}
            placeholder={field.placeholder}
          />
        )
      }}
    </FormField>
  )
}
