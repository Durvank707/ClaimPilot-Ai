import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardHeading,
} from '../components/ui/Card'
import { StatePanel } from '../components/ui/StatePanel'
import { Callout } from '../components/ui/Callout'
import { Badge, RiskBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { FormField } from '../components/ui/FormField'
import { Input } from '../components/ui/Input'
import { HistoryIcon, LookupIcon } from '../components/icons'
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
} from '../features/claimAnalysis/formatters'
import {
  getClaimAnalysisHistory,
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_HISTORY_ORDER,
  type AnalysisHistoryItem,
  type AnalysisHistoryPage,
} from '../api/retrieval'
import { describeApiError, isApiError } from '../api/errors'

/**
 * Claims History page.
 *
 * Retrieves the paginated list of saved analyses for a single claim via
 * `GET /api/v1/claims/{claim_id}/analyses`. The endpoint returns summary rows
 * only, so this page shows summaries only — it never derives or invents full
 * explanations or decision details. It never runs ML inference and never treats
 * a failed request as an empty history.
 *
 * Note on score semantics (verified against the backend implementation):
 * - `fraud_probability` is a model estimate in [0, 1]; it is not proof of fraud.
 * - `risk_score` is a 0–100 prioritization score, NOT a fraud probability.
 * - `risk_level` is a prioritisation band.
 * - `recommendation` is a suggested review step, not an automatic decision.
 */

/** Default page size, mirrored from the retrieval API / backend. */
const PAGE_SIZE = DEFAULT_HISTORY_LIMIT

/** Shown wherever a persisted value is absent, so nothing is fabricated. */
const MISSING = 'Not available'

type HistoryErrorKind = 'not-found' | 'network' | 'server' | 'unexpected'

interface HistoryError {
  kind: HistoryErrorKind
  /** Safe, user-facing detail. Never a stack trace or raw body. */
  message: string
}

type HistoryState =
  | { status: 'idle' }
  | { status: 'loading'; claimId: string; offset: number }
  | { status: 'success'; claimId: string; page: AnalysisHistoryPage }
  | { status: 'error'; claimId: string; offset: number; error: HistoryError }

/**
 * Map any request failure onto a small set of UI states. A 404 is a distinct
 * "claim not found" outcome, not an empty history; a network failure is distinct
 * from a server error. Raw error bodies are never surfaced.
 */
function toHistoryError(error: unknown): HistoryError {
  if (isApiError(error)) {
    if (error.kind === 'http' && error.status === 404) {
      return { kind: 'not-found', message: 'No stored claim matches that ID.' }
    }
    if (error.kind === 'network' || error.kind === 'timeout') {
      return {
        kind: 'network',
        message:
          'The service did not respond. Check the connection and try again.',
      }
    }
    if (error.kind === 'http') {
      return { kind: 'server', message: describeApiError(error) }
    }
    return { kind: 'unexpected', message: describeApiError(error) }
  }
  return {
    kind: 'unexpected',
    message: 'An unexpected error occurred while loading the claim history.',
  }
}

function errorCopy(error: HistoryError): { title: string; description: string } {
  switch (error.kind) {
    case 'not-found':
      return {
        title: 'No saved claim found',
        description:
          'No stored claim matches that ID. Check the ID and try again.',
      }
    case 'network':
      return {
        title: 'The backend could not be reached',
        description:
          'The service may be offline. Check the connection and try again.',
      }
    case 'server':
      return {
        title: 'The claim history could not be loaded',
        description: error.message,
      }
    case 'unexpected':
      return { title: 'Unexpected response', description: error.message }
  }
}

function MissingValue() {
  return <span className="text-ink-400">{MISSING}</span>
}

/** Render an already-formatted value, or an honest placeholder when absent. */
function Value({ children }: { children: string | null }) {
  if (children === null || children === '') return <MissingValue />
  return <span className="text-navy-900">{children}</span>
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
    />
  )
}

/** One history row. Only the summary fields returned by the endpoint. */
function HistoryRow({ item }: { item: AnalysisHistoryItem }) {
  return (
    <tr className="border-b border-ink-100 align-top">
      <td className="px-3 py-3">
        {item.analysis_id ? (
          <span className="break-all text-xs font-medium text-navy-800">
            {item.analysis_id}
          </span>
        ) : (
          <MissingValue />
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-ink-600">
        <Value>{formatDate(item.analyzed_at)}</Value>
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <Value>{formatPercent(item.fraud_probability, { decimals: 1 })}</Value>
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <Value>{formatCurrency(item.predicted_claim_amount)}</Value>
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <Value>{formatNumber(item.anomaly_score, 3)}</Value>
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <Value>{formatNumber(item.risk_score, 1)}</Value>
      </td>
      <td className="px-3 py-3">
        {item.risk_level ? (
          <RiskBadge level={item.risk_level} />
        ) : (
          <MissingValue />
        )}
      </td>
      <td className="px-3 py-3">
        {item.recommendation ? (
          <Badge tone="info">{item.recommendation}</Badge>
        ) : (
          <MissingValue />
        )}
      </td>
    </tr>
  )
}

function HistoryTable({ page }: { page: AnalysisHistoryPage }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-sm">
        <caption className="sr-only">
          Saved analyses for this claim, ordered by analysis time.
        </caption>
        <thead>
          <tr className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
            <th scope="col" className="px-3 py-2 font-medium">
              Analysis ID
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Analyzed
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Fraud probability
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Predicted amount
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Anomaly score
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Risk score
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Risk level
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Review recommendation
            </th>
          </tr>
        </thead>
        <tbody>
          {page.items.map((item, index) => (
            <HistoryRow key={item.analysis_id ?? index} item={item} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HistoryCard({
  page,
  claimId,
  onPage,
}: {
  page: AnalysisHistoryPage
  claimId: string
  onPage: (offset: number) => void
}) {
  const limit = page.limit || PAGE_SIZE
  const offset = page.offset
  const total = page.total
  const shownFrom = offset + 1
  const shownTo = offset + page.items.length
  const hasPrevious = offset > 0
  // "No more records" is decided from the backend's own `total`, never invented.
  const hasNext = offset + page.items.length < total

  return (
    <Card>
      <CardHeader>
        <CardHeading
          title="Analysis history"
          description={`Saved analyses for “${claimId}”, newest first.`}
          icon={<HistoryIcon width={16} height={16} />}
        />
        <Badge tone="info">
          {total} {total === 1 ? 'analysis' : 'analyses'}
        </Badge>
      </CardHeader>

      <HistoryTable page={page} />

      <div className="border-t border-ink-200 px-5 py-3">
        <p className="text-xs text-ink-500">
          Fraud probability is a model estimate, not proof of fraud. Risk level
          is a prioritisation band, not a verdict. The review recommendation is a
          suggested review step for a human claims officer, not an automatic
          claim decision. Summaries only — full explanations and decisions are
          not included in the history list.
        </p>
      </div>

      <CardFooter className="justify-between">
        <p className="text-xs text-ink-500">
          {`Showing ${shownFrom}-${shownTo} of ${total} ${
            total === 1 ? 'analysis' : 'analyses'
          }`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPage(Math.max(0, offset - limit))}
            disabled={!hasPrevious}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPage(offset + limit)}
            disabled={!hasNext}
          >
            Next
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}

/**
 * Claims History page component.
 *
 * A single request token guards every request (initial search and pagination),
 * so an out-of-order response — an older claim search or an older page — can
 * never overwrite a newer result. Starting a new search clears the previous
 * results so they are not mistaken for the new claim's history.
 */
export function ClaimsHistoryPage() {
  const [query, setQuery] = useState('')
  const [validationError, setValidationError] = useState<string | undefined>(
    undefined,
  )
  const [state, setState] = useState<HistoryState>({ status: 'idle' })
  const [announcement, setAnnouncement] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  // The in-flight target (used to reject duplicate submissions of the same
  // request) and a monotonic token (used to discard superseded responses).
  const inFlight = useRef<{ claimId: string; offset: number; token: number } | null>(
    null,
  )
  const requestSeq = useRef(0)

  const loading = state.status === 'loading'

  const focusInput = () => {
    formRef.current
      ?.querySelector<HTMLInputElement>('[name="claimId"]')
      ?.focus()
  }

  /** Run one history request. `claimId` must be trimmed and non-empty. */
  const runHistory = async (claimId: string, offset: number) => {
    // Ignore a duplicate submission of the exact same request while running.
    const active = inFlight.current
    if (
      active !== null &&
      active.claimId === claimId &&
      active.offset === offset
    ) {
      return
    }

    setValidationError(undefined)
    const token = ++requestSeq.current
    inFlight.current = { claimId, offset, token }
    setState({ status: 'loading', claimId, offset })
    setAnnouncement(`Loading analysis history for claim ${claimId}.`)

    try {
      const page = await getClaimAnalysisHistory(claimId, {
        limit: PAGE_SIZE,
        offset,
        order: DEFAULT_HISTORY_ORDER,
      })
      // A newer request has started; discard this stale response.
      if (token !== requestSeq.current) return
      setState({ status: 'success', claimId, page })
      setAnnouncement(
        page.total === 0
          ? `No saved analyses for claim ${claimId}.`
          : `Loaded analyses ${page.offset + 1}-${
              page.offset + page.items.length
            } of ${page.total} for claim ${claimId}.`,
      )
    } catch (error) {
      if (token !== requestSeq.current) return
      const info = toHistoryError(error)
      setState({ status: 'error', claimId, offset, error: info })
      setAnnouncement(info.message)
    } finally {
      if (inFlight.current?.token === token) inFlight.current = null
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const id = query.trim()
    if (id === '') {
      setValidationError('Enter a claim ID to search.')
      setAnnouncement('Enter a claim ID to search.')
      focusInput()
      return
    }
    // A new search always resets pagination to the first page.
    void runHistory(id, 0)
  }

  const handleChange = (value: string) => {
    setQuery(value)
    if (validationError !== undefined) setValidationError(undefined)
  }

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Claims History"
        description="Browse the saved analyses for a claim, newest first."
      />

      <Callout tone="info" title="Decision support only">
        The history list summarises stored analyses for a human claims officer.
        A high score or a review recommendation is never an automatic decision,
        and a fraud probability is not proof of fraud.
      </Callout>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <form
        ref={formRef}
        noValidate
        autoComplete="off"
        aria-label="Claims history form"
        onSubmit={handleSubmit}
      >
        <Card>
          <CardHeader>
            <CardHeading
              title="Find a claim's history"
              description="Enter the claim ID of an existing saved claim to load its analysis history."
              icon={<HistoryIcon width={16} height={16} />}
            />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="sm:flex-1">
                <FormField
                  label="Claim ID"
                  hint="The identifier assigned when the claim was saved."
                  error={validationError}
                  required
                >
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      name="claimId"
                      type="text"
                      value={query}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="e.g. CLM-000123"
                      aria-describedby={describedBy}
                      invalid={invalid}
                      onChange={(event) => handleChange(event.target.value)}
                    />
                  )}
                </FormField>
              </div>
              <Button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="sm:mb-6"
              >
                {loading ? (
                  <>
                    <Spinner />
                    Searching…
                  </>
                ) : (
                  <>
                    <LookupIcon width={16} height={16} />
                    Search
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <HistoryResult
        state={state}
        onPage={(offset) => {
          if (state.status === 'success') {
            void runHistory(state.claimId, offset)
          }
        }}
        onRetry={() => {
          if (state.status === 'error') {
            void runHistory(state.claimId, state.offset)
          }
        }}
      />
    </>
  )
}

function HistoryResult({
  state,
  onPage,
  onRetry,
}: {
  state: HistoryState
  onPage: (offset: number) => void
  onRetry: () => void
}) {
  if (state.status === 'success') {
    if (state.page.items.length === 0) {
      return (
        <Card>
          <StatePanel
            title="No saved analyses yet"
            description={`This claim has no saved analyses yet. Run a new claim analysis to create one.`}
          />
        </Card>
      )
    }
    return (
      <HistoryCard
        page={state.page}
        claimId={state.claimId}
        onPage={onPage}
      />
    )
  }

  const copy = state.status === 'error' ? errorCopy(state.error) : null

  return (
    <div className="rounded-lg border border-dashed border-ink-200">
      {state.status === 'idle' ? (
        <StatePanel
          title="No claim selected"
          description="Enter a claim ID above to load its saved analysis history. Nothing is shown until a claim is selected."
        />
      ) : null}

      {state.status === 'loading' ? (
        <StatePanel
          variant="loading"
          title="Loading claim history…"
          description={`Retrieving analyses for “${state.claimId}” from the claims database.`}
        />
      ) : null}

      {state.status === 'error' && copy ? (
        <StatePanel
          variant="error"
          title={copy.title}
          description={copy.description}
          action={
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          }
        />
      ) : null}
    </div>
  )
}
