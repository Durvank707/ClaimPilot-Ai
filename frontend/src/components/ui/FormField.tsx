import { useId } from 'react'
import type { ReactNode } from 'react'

export interface FormFieldProps {
  label: string
  /** Optional short helper text shown beneath the control. */
  hint?: ReactNode
  /** Validation message. When present the control is marked invalid. */
  error?: string
  required?: boolean
  /** Rendered inside the field, e.g. an <input>. Receives the generated id. */
  children: (field: { id: string; describedBy?: string; invalid: boolean }) => ReactNode
}

/**
 * Accessible wrapper that wires a <label> to a control and connects hint /
 * error text via aria-describedby. Used by the future claim form; provided now
 * so the form placeholder and later Step 3 share one implementation.
 */
export function FormField({
  label,
  hint,
  error,
  required,
  children,
}: FormFieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-navy-800">
        {label}
        {required ? (
          <span className="ml-1 text-status-critical" aria-hidden="true">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-status-critical">
          {error}
        </p>
      ) : null}
    </div>
  )
}
