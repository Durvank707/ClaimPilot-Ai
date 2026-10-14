import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { InfoIcon } from '../icons'

type CalloutTone = 'info' | 'warning' | 'success' | 'neutral'

const toneStyles: Record<CalloutTone, string> = {
  info: 'border-accent-200 bg-accent-50 text-navy-800',
  warning: 'border-[#f0dcb4] bg-status-mediumBg text-navy-800',
  success: 'border-[#bfe6cf] bg-status-lowBg text-navy-800',
  neutral: 'border-ink-200 bg-ink-50 text-navy-800',
}

const iconTone: Record<CalloutTone, string> = {
  info: 'text-accent-600',
  warning: 'text-status-medium',
  success: 'text-status-low',
  neutral: 'text-ink-500',
}

export interface CalloutProps {
  tone?: CalloutTone
  title?: string
  children: ReactNode
  icon?: ReactNode
  className?: string
}

/**
 * Inline message block used for guidance and the human-in-the-loop reminder.
 */
export function Callout({
  tone = 'info',
  title,
  children,
  icon,
  className,
}: CalloutProps) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-lg border px-4 py-3 text-sm',
        toneStyles[tone],
        className,
      )}
    >
      <span aria-hidden="true" className={cn('mt-0.5 shrink-0', iconTone[tone])}>
        {icon ?? <InfoIcon width={18} height={18} />}
      </span>
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn(title && 'mt-0.5', 'text-ink-600')}>{children}</div>
      </div>
    </div>
  )
}
