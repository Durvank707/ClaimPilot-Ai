import { cn } from '../../lib/cn'
import { ShieldIcon } from '../icons'
import { NAV_ITEMS, type ViewId } from '../../app/navigation'

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-600 text-white">
        <ShieldIcon width={20} height={20} />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-white">
          ClaimPilot AI
        </span>
        <span className="block text-2xs text-navy-300">
          Claims Intelligence
        </span>
      </span>
    </div>
  )
}

export function Sidebar({
  activeView,
  onNavigate,
  className,
}: {
  activeView: ViewId
  onNavigate: (id: ViewId) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-full flex-col bg-navy-900 text-navy-100',
        className,
      )}
    >
      <div className="flex h-16 items-center border-b border-white/10 px-5">
        <BrandMark />
      </div>

      <nav
        aria-label="Primary"
        className="flex-1 overflow-y-auto px-3 py-4"
      >
        <p className="px-2 pb-2 text-2xs font-semibold uppercase tracking-wider text-navy-400">
          Workspace
        </p>
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = item.id === activeView
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                    isActive
                      ? 'bg-white/10 font-medium text-white'
                      : 'text-navy-200 hover:bg-white/5 hover:text-white',
                  )}
                >
                  <Icon
                    width={18}
                    height={18}
                    className={cn(
                      'shrink-0',
                      isActive ? 'text-accent-300' : 'text-navy-400',
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        <div className="flex items-start gap-2 text-2xs text-navy-300">
          <ShieldIcon
            width={14}
            height={14}
            className="mt-0.5 shrink-0 text-accent-300"
          />
          <p>
            Recommendations only. A human reviewer makes every final claim
            decision.
          </p>
        </div>
      </div>
    </div>
  )
}
