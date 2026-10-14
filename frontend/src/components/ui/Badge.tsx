import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export type BadgeTone =
  | 'neutral'
  | 'info'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-ink-100 text-ink-700 border-ink-200',
  info: 'bg-status-infoBg text-accent-700 border-accent-200',
  low: 'bg-status-lowBg text-[#0b6b3d] border-[#bfe6cf]',
  medium: 'bg-status-mediumBg text-[#8a5a12] border-[#f0dcb4]',
  high: 'bg-status-highBg text-[#9a4c05] border-[#f4cfa4]',
  critical: 'bg-status-criticalBg text-[#96271c] border-[#f1c3be]',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  /** Show a leading status dot. Dot is decorative; the label carries meaning. */
  withDot?: boolean
}

export function Badge({
  tone = 'neutral',
  withDot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {withDot ? (
        <span
          aria-hidden="true"
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            tone === 'neutral' && 'bg-ink-400',
            tone === 'info' && 'bg-accent-600',
            tone === 'low' && 'bg-status-low',
            tone === 'medium' && 'bg-status-medium',
            tone === 'high' && 'bg-status-high',
            tone === 'critical' && 'bg-status-critical',
          )}
        />
      ) : null}
      {children}
    </span>
  )
}

const riskToneMap: Record<string, BadgeTone> = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
}

/**
 * Risk level indicator. Communicates level with a text label as well as
 * colour so it never relies on colour alone.
 */
export function RiskBadge({
  level,
  className,
}: {
  level: string
  className?: string
}) {
  const normalized = level.toUpperCase()
  const tone = riskToneMap[normalized] ?? 'neutral'
  return (
    <Badge tone={tone} withDot className={cn('uppercase tracking-wide', className)}>
      {normalized || 'UNKNOWN'}
    </Badge>
  )
}
