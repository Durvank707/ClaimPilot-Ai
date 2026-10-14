import { Badge, type BadgeTone } from '../ui/Badge'
import { RefreshIcon } from '../icons'
import { useBackendStatus, type BackendStatus } from '../../hooks/useBackendStatus'
import { cn } from '../../lib/cn'

interface Presentation {
  tone: BadgeTone
  label: string
  short: string
}

const PRESENTATION: Record<BackendStatus['phase'], Presentation> = {
  checking: { tone: 'neutral', label: 'Checking backend…', short: 'Checking' },
  ready: { tone: 'low', label: 'Backend ready', short: 'Ready' },
  'not-ready': { tone: 'medium', label: 'Backend not ready', short: 'Not ready' },
  unreachable: {
    tone: 'critical',
    label: 'Backend unavailable',
    short: 'Offline',
  },
}

/**
 * Compact header indicator for backend reachability and readiness.
 *
 * Reachability (health) and readiness (models loaded) are separate signals, so
 * a reachable-but-not-ready backend is clearly distinguished from an
 * unreachable one. Includes a manual refresh; no background polling.
 */
export function ConnectionStatus() {
  const { status, refresh } = useBackendStatus()
  const presentation = PRESENTATION[status.phase]
  const checking = status.phase === 'checking'
  const detail =
    status.phase === 'checking'
      ? 'Contacting the backend service…'
      : status.detail

  return (
    <div className="flex items-center gap-1">
      <Badge
        tone={presentation.tone}
        withDot
        role="status"
        aria-live="polite"
        title={detail}
        className={cn(checking && 'animate-pulse')}
      >
        <span className="hidden sm:inline">{presentation.label}</span>
        <span className="sm:hidden">{presentation.short}</span>
      </Badge>
      <button
        type="button"
        onClick={() => void refresh()}
        disabled={checking}
        aria-label="Re-check backend connection"
        title={detail}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshIcon
          width={16}
          height={16}
          className={cn(checking && 'animate-spin')}
        />
      </button>
    </div>
  )
}
