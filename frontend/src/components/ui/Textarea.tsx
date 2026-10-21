import type { TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

/**
 * Multi-line counterpart to `Input`. Mirrors the shared field styling but
 * without the single-line fixed height, so it can grow with its rows.
 */
export function Textarea({ invalid, className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        'w-full rounded-lg border bg-white px-3 py-2 text-sm text-navy-900',
        'placeholder:text-ink-400',
        'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400',
        invalid ? 'border-status-critical' : 'border-ink-300',
        className,
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
}
