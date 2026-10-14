import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { CloseIcon } from '../icons'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import type { ViewId } from '../../app/navigation'

/**
 * Application chrome: persistent sidebar on large screens, an off-canvas
 * drawer on small screens, a sticky header and the main content region.
 */
export function AppShell({
  activeView,
  onNavigate,
  pageTitle,
  children,
}: {
  activeView: ViewId
  onNavigate: (id: ViewId) => void
  pageTitle: string
  children: ReactNode
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Move focus into the drawer when it opens.
  useEffect(() => {
    if (drawerOpen) closeButtonRef.current?.focus()
  }, [drawerOpen])

  // Close the drawer on Escape.
  useEffect(() => {
    if (!drawerOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawerOpen])

  function handleNavigate(id: ViewId) {
    onNavigate(id)
    setDrawerOpen(false)
  }

  return (
    <div className="min-h-screen bg-ink-50 lg:grid lg:grid-cols-[16rem_1fr]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-navy-900 focus:shadow-panel"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <div className="sticky top-0 h-screen">
          <Sidebar activeView={activeView} onNavigate={handleNavigate} />
        </div>
      </div>

      {/* Mobile drawer */}
      <div
        className={cn(
          'fixed inset-0 z-40 lg:hidden',
          drawerOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!drawerOpen}
      >
        <div
          className={cn(
            'absolute inset-0 bg-navy-950/50 transition-opacity',
            drawerOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={() => setDrawerOpen(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Primary navigation"
          inert={!drawerOpen}
          className={cn(
            'absolute left-0 top-0 h-full w-72 max-w-[80%] transition-transform duration-200',
            drawerOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation menu"
            className="absolute right-3 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-navy-200 hover:bg-white/10 hover:text-white"
          >
            <CloseIcon width={18} height={18} />
          </button>
          <Sidebar activeView={activeView} onNavigate={handleNavigate} />
        </div>
      </div>

      <div className="flex min-h-screen flex-col">
        <Header title={pageTitle} onOpenSidebar={() => setDrawerOpen(true)} />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          <div className="space-y-6">{children}</div>
        </main>
        <footer className="border-t border-ink-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
          <p className="text-xs text-ink-500">
            ClaimPilot AI provides decision support for claims officers. It does
            not approve, reject or accuse. Final decisions always require human
            review.
          </p>
        </footer>
      </div>
    </div>
  )
}
