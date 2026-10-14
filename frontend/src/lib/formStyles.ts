import { cn } from './cn'

/** Shared input styling so raw inputs stay visually consistent. */
export function fieldClassName(invalid?: boolean, className?: string) {
  return cn(
    'h-10 w-full rounded-lg border bg-white px-3 text-sm text-navy-900',
    'placeholder:text-ink-400',
    'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400',
    invalid ? 'border-status-critical' : 'border-ink-300',
    className,
  )
}
