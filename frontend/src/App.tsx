import { useCallback, useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { getNavItem, type ViewId } from './app/navigation'
import { OverviewPage } from './pages/OverviewPage'
import { NewClaimPage } from './pages/NewClaimPage'
import { ClaimsHistoryPage } from './pages/ClaimsHistoryPage'
import { ClaimLookupPage } from './pages/ClaimLookupPage'

/**
 * ClaimPilot AI frontend shell.
 *
 * Navigation is intentionally local state (no router yet). `view` selects the
 * primary workspace destination. `selectedAnalysisId` is a contextual drill-down
 * from Claims History into the Saved Analysis Details view; it is kept separate
 * so the details can be reached from the history list and the list (with its
 * search results) is restored intact when the user returns.
 */
function App() {
  const [view, setView] = useState<ViewId>('overview')
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(
    null,
  )

  const navigate = useCallback((id: ViewId) => {
    // Any primary navigation ends the contextual drill-down.
    setSelectedAnalysisId(null)
    setView(id)
  }, [])

  const openAnalysis = useCallback((analysisId: string) => {
    // A dashboard "recent activity" row or a history row opens the saved
    // analysis details inside Claims History, so switch to that destination.
    setView('history')
    setSelectedAnalysisId(analysisId)
  }, [])

  const closeAnalysis = useCallback(() => {
    setSelectedAnalysisId(null)
  }, [])

  const active = getNavItem(view)
  const detailsOpen =
    view === 'history' &&
    selectedAnalysisId !== null &&
    selectedAnalysisId.trim() !== ''

  return (
    <AppShell
      activeView={view}
      onNavigate={navigate}
      pageTitle={detailsOpen ? 'Saved Analysis' : active.label}
    >
      {view === 'overview' ? (
        <OverviewPage onOpenAnalysis={openAnalysis} />
      ) : null}
      {view === 'new-claim' ? <NewClaimPage /> : null}
      {view === 'history' ? (
        <ClaimsHistoryPage
          selectedAnalysisId={selectedAnalysisId}
          onOpenAnalysis={openAnalysis}
          onBack={closeAnalysis}
        />
      ) : null}
      {view === 'lookup' ? <ClaimLookupPage /> : null}
    </AppShell>
  )
}

export default App
