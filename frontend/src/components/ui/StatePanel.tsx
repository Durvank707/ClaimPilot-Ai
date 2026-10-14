import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { AlertIcon, InfoIcon, SearchOffIcon } from '../icons'

export type StatePanelVariant = 'empty' | 'error' | 'loading'

const variantStyles: Record<StatePanelVariant, { icon: ReactNode; ring: string }> = {
  empty: {
    icon: <SearchOffIcon width={22} height={22} />,
    ring: 'bg-ink-100 text-ink-500',
  },
  error: {
    icon: <AlertIcon width={22} height={22} />,
    ring: 'bg-status-criticalBg text-status-critical',
  },
  loading: {
    icon: <InfoIcon width={22} height={22} />,
    ring: 'bg-status-infoBg text-accent-600',
  },
}

/**
 * Reusable placeholder for empty, error and loading regions so every screen
 * communicates these states consistently.
 */
export function StatePanel({
  variant = 'empty',
  title,
  description,
  action,
  className,
  role,
}: {
  variant?: StatePanelVariant
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
  role?: 'status' | 'alert'
}) {
  const styles = variantStyles[variant]

  return (
    <div
      role={role ?? (variant === 'error' ? 'alert' : 'status')}
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-full',
          styles.ring,
          variant === 'loading' && 'animate-pulse',
        )}
      >
        {styles.icon}
      </span>
      <div className="max-w-md">
        <p className="text-sm font-semibold text-navy-900">{title}</p>
        {description ? (
          <p className="mt-1 text-sm text-ink-500">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
