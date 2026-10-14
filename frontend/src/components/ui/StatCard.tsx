import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Card } from './Card'

/**
 * Compact metric tile. Values shown in this step are explicitly illustrative;
 * the `illustrative` flag renders a visible label so nothing is mistaken for
 * a real database figure.
 */
export function StatCard({
  label,
  value,
  helper,
  icon,
  illustrative = false,
  className,
}: {
  label: string
  value: ReactNode
  helper?: ReactNode
  icon?: ReactNode
  illustrative?: boolean
  className?: string
}) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
          {label}
        </p>
        {icon ? (
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-50 text-navy-600"
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-navy-900">
        {value}
      </p>
      {helper ? <p className="mt-1 text-xs text-ink-500">{helper}</p> : null}
      {illustrative ? (
        <p className="mt-3 inline-flex rounded bg-ink-100 px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-ink-500">
          Illustrative
        </p>
      ) : null}
    </Card>
  )
}
