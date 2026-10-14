import { useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { getNavItem, type ViewId } from './app/navigation'
import { OverviewPage } from './pages/OverviewPage'
import { NewClaimPage } from './pages/NewClaimPage'
import { ClaimsHistoryPage } from './pages/ClaimsHistoryPage'
import { ClaimLookupPage } from './pages/ClaimLookupPage'

/**
 * ClaimPilot AI frontend shell.
 *
 * Navigation is intentionally local state (no router yet): this step focuses on
 * the design system and layout. Pages are presentational placeholders.
 */
function App() {
  const [view, setView] = useState<ViewId>('overview')
  const active = getNavItem(view)

  return (
    <AppShell activeView={view} onNavigate={setView} pageTitle={active.label}>
      {view === 'overview' ? <OverviewPage /> : null}
      {view === 'new-claim' ? <NewClaimPage /> : null}
      {view === 'history' ? <ClaimsHistoryPage /> : null}
      {view === 'lookup' ? <ClaimLookupPage /> : null}
    </AppShell>
  )
}

export default App
