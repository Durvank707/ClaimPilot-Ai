import { BellIcon, MenuIcon } from '../icons'
import { ConnectionStatus } from './ConnectionStatus'

export function Header({
  title,
  onOpenSidebar,
}: {
  title: string
  onOpenSidebar: () => void
}) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-ink-200 bg-white/95 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Open navigation menu"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-navy-700 hover:bg-ink-100 lg:hidden"
      >
        <MenuIcon />
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-navy-900">{title}</p>
      </div>

      <div className="flex items-center gap-2">
        <ConnectionStatus />
        <button
          type="button"
          aria-label="Notifications (placeholder)"
          disabled
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-400 disabled:cursor-not-allowed"
        >
          <BellIcon width={18} height={18} />
        </button>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-white"
          aria-hidden="true"
          title="Signed-in reviewer (placeholder)"
        >
          CO
        </div>
      </div>
    </header>
  )
}
