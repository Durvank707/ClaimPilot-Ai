import type { InputHTMLAttributes } from 'react'
import { fieldClassName } from '../../lib/formStyles'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

/**
 * Thin native <input> styled with the shared field styles. Kept tiny so the
 * claim form can reuse one control implementation across every text/number/date
 * field and inherit platform keyboard and screen-reader behaviour.
 */
export function Input({ invalid, className, ...props }: InputProps) {
  return (
    <input
      className={fieldClassName(invalid, className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
}
