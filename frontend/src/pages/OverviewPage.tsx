import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { StatCard } from '../components/ui/StatCard'
import { Callout } from '../components/ui/Callout'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardHeading,
} from '../components/ui/Card'
import { Badge, RiskBadge } from '../components/ui/Badge'
import { StatePanel } from '../components/ui/StatePanel'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Select'
import {
  AlertIcon,
  CheckIcon,
  HistoryIcon,
  ShieldIcon,
  UsersIcon,
} from '../components/icons'
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatWaitingAge,
} from '../features/claimAnalysis/formatters'
import {
  DASHBOARD_RISK_FILTER_OPTIONS,
  getDashboardSummary,
  getReviewQueue,
  type DashboardRecentAnalysis,
  type DashboardRecentReview,
  type DashboardReviewOutcomes,
  type DashboardReviewQueueItem,
  type DashboardReviewQueuePage,
  type DashboardRiskDistribution,
  type DashboardRiskReviewStatus,
  type DashboardSummary,
} from '../api/dashboard'
import { describeApiError, isApiError } from '../api/errors'

/**
 * Dashboard (workspace landing page).
 *
 * Every figure is aggregated from persisted records by the backend
 * (`GET /api/v1/dashboard/summary`), via `getDashboardSummary`. Nothing here is
 * hard-coded, illustrative or inferred: an absent value renders as
 * "Not available", and a failed request is shown as an error rather than an
 * empty dashboard, so "no data" can never be confused with "no response".
 *
 * Counting semantics are stated in the UI so records are never mislabelled:
 * - "Analyses" counts persisted analysis records, NOT unique claims.
 * - "Claims" counts distinct persisted claim records.
 * - "Review records" counts stored reviews; one analysis may have several.
 * - "Latest review outcome per analysis" counts analyses, not reviews.
 *
 * The page is decision support only. It never approves, rejects or escalates
 * anything; human reviewers remain responsible for every decision.
 */

/** Shown wherever a persisted value is absent, so nothing is fabricated. */
const MISSING = 'Not available'

const RISK_BAR_TONE: Record<string, string> = {
  LOW: 'bg-status-low',
  MEDIUM: 'bg-status-medium',
  HIGH: 'bg-status-high',
  CRITICAL: 'bg-status-critical',
  UNKNOWN: 'bg-ink-400',
}

const OUTCOME_LABELS: Record<keyof DashboardReviewOutcomes, string> = {
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  NEEDS_MORE_INFO: 'Needs more info',
  ESCALATED: 'Escalated',
  UNKNOWN: 'Unknown',
}

/** Outcomes always shown, in a fixed order; UNKNOWN is appended only if present. */
const OUTCOME_ORDER: ReadonlyArray<keyof DashboardReviewOutcomes> = [
  'APPROVED',
  'REJECTED',
  'NEEDS_MORE_INFO',
  'ESCALATED',
]

/** Rows fetched per review-queue page. */
const QUEUE_PAGE_SIZE = 10

/** Risk buckets offered by the queue filter, in a stable display order. */
const RISK_FILTER_OPTIONS: readonly string[] = DASHBOARD_RISK_FILTER_OPTIONS

/** Tone for a review outcome badge, so the label never relies on colour alone. */
function outcomeTone(
  outcome: string | null,
): 'low' | 'medium' | 'high' | 'critical' | 'neutral' {
  switch (outcome) {
    case 'APPROVED':
      return 'low'
    case 'REJECTED':
      return 'critical'
    case 'NEEDS_MORE_INFO':
      return 'medium'
    case 'ESCALATED':
      return 'high'
    default:
      return 'neutral'
  }
}

/** Human label for a stored outcome, falling back to the raw value verbatim. */
function outcomeLabel(value: string | null): string {
  if (value === null || value === '') return MISSING
  return OUTCOME_LABELS[value as keyof DashboardReviewOutcomes] ?? value
}

type DashboardErrorKind = 'not-found' | 'network' | 'server' | 'unexpected'

interface DashboardError {
  kind: DashboardErrorKind
  /** Safe, user-facing detail. Never a stack trace or raw body. */
  message: string
}

/**
 * The outcome of the most recent summary request. Loading is derived from
 * `null`, so the effect never has to synchronously reset state during render.
 */
type DashboardResult =
  | { status: 'success'; summary: DashboardSummary }
  | { status: 'error'; error: DashboardError }

/**
 * The outcome of the most recent review-queue request. Loading is a distinct
 * member (not derived) so a filter/page change can show a loading state without
 * resetting the previously rendered page synchronously during render.
 */
type QueueResult =
  | { status: 'loading' }
  | { status: 'success'; page: DashboardReviewQueuePage }
  | { status: 'error'; error: DashboardError }

/**
 * Map any request failure onto a small set of UI states. A 404, a network
 * failure and a server error are kept distinct; raw bodies are never surfaced.
 */
function toDashboardError(error: unknown): DashboardError {
  if (isApiError(error)) {
    if (error.kind === 'http' && error.status === 404) {
      return {
        kind: 'not-found',
        message: 'The dashboard summary endpoint is not available.',
      }
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
    message: 'An unexpected error occurred while loading the dashboard.',
  }
}

function errorCopy(error: DashboardError): { title: string; description: string } {
  switch (error.kind) {
    case 'not-found':
      return {
        title: 'Dashboard unavailable',
        description: 'The dashboard summary could not be found on the server.',
      }
    case 'network':
      return {
        title: 'The backend could not be reached',
        description:
          'The service may be offline. Check the connection and try again.',
      }
    case 'server':
      return {
        title: 'The dashboard could not be loaded',
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

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm
}

/** Persisted analyses grouped by prioritisation level, as labelled bars. */
function RiskDistribution({
  distribution,
  status,
}: {
  distribution: DashboardRiskDistribution
  status: DashboardRiskReviewStatus
}) {
  const entries: { level: string; count: number }[] = [
    { level: 'LOW', count: distribution.LOW },
    { level: 'MEDIUM', count: distribution.MEDIUM },
    { level: 'HIGH', count: distribution.HIGH },
    { level: 'CRITICAL', count: distribution.CRITICAL },
  ]
  if (distribution.UNKNOWN > 0) {
    entries.push({ level: 'UNKNOWN', count: distribution.UNKNOWN })
  }
  const total = entries.reduce((sum, entry) => sum + entry.count, 0)

  if (total === 0) {
    return (
      <StatePanel
        title="No analyses to summarise"
        description="The risk distribution appears once analyses have been saved."
      />
    )
  }

  return (
    <ul className="space-y-4">
      {entries.map(({ level, count }) => {
        const pct = Math.round((count / total) * 100)
        const bucket = status[level as keyof DashboardRiskReviewStatus]
        return (
          <li key={level}>
            <div className="flex items-center justify-between gap-4">
              <RiskBadge level={level} />
              <span className="text-sm font-medium text-navy-800">
                {count} {plural(count, 'analysis', 'analyses')} · {pct}%
              </span>
            </div>
            <div
              className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink-100"
              role="img"
              aria-label={`${level} risk: ${count} of ${total} analyses (${pct} percent)`}
            >
              <div
                className={`h-full rounded-full ${RISK_BAR_TONE[level]}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {bucket ? (
              <p className="mt-1 text-xs text-ink-500">
                {bucket.awaiting_review} awaiting review · {bucket.reviewed}{' '}
                {plural(bucket.reviewed, 'analysis', 'analyses')} reviewed
              </p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/** Counts for a set of review outcomes, with an honest empty state. */
function OutcomeList({
  counts,
  emptyLabel,
}: {
  counts: DashboardReviewOutcomes
  emptyLabel: string
}) {
  const entries: { key: keyof DashboardReviewOutcomes; count: number }[] =
    OUTCOME_ORDER.map((key) => ({ key, count: counts[key] }))
  if (counts.UNKNOWN > 0) {
    entries.push({ key: 'UNKNOWN', count: counts.UNKNOWN })
  }
  const total = entries.reduce((sum, entry) => sum + entry.count, 0)

  if (total === 0) {
    return <p className="text-sm text-ink-500">{emptyLabel}</p>
  }

  return (
    <ul className="space-y-2">
      {entries.map(({ key, count }) => (
        <li
          key={key}
          className="flex items-center justify-between gap-3 text-sm"
        >
          <span className="text-navy-800">{OUTCOME_LABELS[key]}</span>
          <span className="font-medium text-navy-900">{count}</span>
        </li>
      ))}
    </ul>
  )
}

/** One recent-activity row. Only the summary fields returned by the endpoint. */
function RecentRow({
  item,
  onOpenAnalysis,
}: {
  item: DashboardRecentAnalysis
  onOpenAnalysis?: (analysisId: string) => void
}) {
  const analysisId =
    typeof item.analysis_id === 'string' ? item.analysis_id.trim() : ''
  const canOpen = analysisId !== '' && onOpenAnalysis !== undefined

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
      <td className="px-3 py-3">
        {item.claim_id ? (
          <span className="break-all text-xs text-ink-600">{item.claim_id}</span>
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
      <td className="px-3 py-3">
        {item.risk_level ? (
          <RiskBadge level={item.risk_level} />
        ) : (
          <MissingValue />
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <Value>{formatNumber(item.risk_score, 1)}</Value>
      </td>
      <td className="px-3 py-3">
        {item.recommendation ? (
          <Badge tone="info">{item.recommendation}</Badge>
        ) : (
          <MissingValue />
        )}
      </td>
      <td className="px-3 py-3">
        <Button
          variant="secondary"
          size="sm"
          disabled={!canOpen}
          aria-label={
            analysisId !== ''
              ? `View details for analysis ${analysisId}`
              : 'View details unavailable'
          }
          onClick={() => {
            if (canOpen) onOpenAnalysis?.(analysisId)
          }}
        >
          View details
        </Button>
      </td>
    </tr>
  )
}

function RecentActivity({
  items,
  onOpenAnalysis,
}: {
  items: DashboardRecentAnalysis[]
  onOpenAnalysis?: (analysisId: string) => void
}) {
  if (items.length === 0) {
    return (
      <StatePanel
        title="No activity yet"
        description="Recent analyses will appear here once a claim has been analysed."
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-sm">
        <caption className="sr-only">
          Most recently analysed claims, newest first.
        </caption>
        <thead>
          <tr className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
            <th scope="col" className="px-3 py-2 font-medium">
              Analysis ID
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Claim
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Analyzed
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Fraud probability
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Risk level
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Risk score
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Recommendation
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Details
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <RecentRow
              key={item.analysis_id ?? index}
              item={item}
              onOpenAnalysis={onOpenAnalysis}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Newest human-review *records*. One analysis may contribute several rows. */
function RecentReviews({ items }: { items: DashboardRecentReview[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        No human reviews have been recorded yet.
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {items.map((review, index) => (
        <li
          key={review.review_id ?? `${review.analysis_id ?? 'analysis'}-${index}`}
          className="border-b border-ink-100 pb-3 last:border-0 last:pb-0"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone={outcomeTone(review.final_decision)} withDot>
              {outcomeLabel(review.final_decision)}
            </Badge>
            <span className="text-xs text-ink-500">
              {formatDate(review.reviewed_at) ?? MISSING}
            </span>
          </div>
          <p className="mt-1 break-all text-xs text-ink-600">
            {review.analysis_id
              ? `Analysis ${review.analysis_id}`
              : 'Analysis not available'}
            {review.claim_id ? ` · Claim ${review.claim_id}` : ''}
          </p>
          <p className="text-xs text-ink-500">
            Reviewer: {review.reviewer_id ?? MISSING}
            {review.risk_level ? ` · Risk ${review.risk_level.toUpperCase()}` : ''}
          </p>
        </li>
      ))}
    </ul>
  )
}

/** One review-queue row: prioritisation data plus the newest review record. */
function QueueRow({
  item,
  onOpenAnalysis,
}: {
  item: DashboardReviewQueueItem
  onOpenAnalysis?: (analysisId: string) => void
}) {
  const analysisId =
    typeof item.analysis_id === 'string' ? item.analysis_id.trim() : ''
  const canOpen = analysisId !== '' && onOpenAnalysis !== undefined
  const waiting = formatWaitingAge(item.analyzed_at)

  const reviewSummary =
    item.review_count === 0
      ? 'No reviews yet'
      : `${item.review_count} ${plural(item.review_count, 'review', 'reviews')} · latest ${outcomeLabel(item.latest_review_outcome)}`

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
      <td className="px-3 py-3">
        {item.claim_id ? (
          <span className="break-all text-xs text-ink-600">
            {item.claim_id}
          </span>
        ) : (
          <MissingValue />
        )}
        {item.incident_type ? (
          <span className="mt-1 block text-xs text-ink-500">
            {item.incident_type}
            {item.claim_amount !== null
              ? ` · ${formatCurrency(item.claim_amount) ?? MISSING}`
              : ''}
          </span>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        {item.risk_level ? (
          <RiskBadge level={item.risk_level} />
        ) : (
          <MissingValue />
        )}
        <span className="mt-1 block text-xs text-ink-500">
          <Value>{formatNumber(item.risk_score, 1)}</Value>
        </span>
      </td>
      <td className="px-3 py-3">
        {item.recommendation ? (
          <Badge tone="info">{item.recommendation}</Badge>
        ) : (
          <MissingValue />
        )}
      </td>
      <td className="px-3 py-3 text-xs text-ink-600">{reviewSummary}</td>
      <td className="whitespace-nowrap px-3 py-3 text-xs text-ink-600">
        {waiting === null ? <MissingValue /> : `Waiting ${waiting}`}
      </td>
      <td className="px-3 py-3">
        <Button
          variant="secondary"
          size="sm"
          disabled={!canOpen}
          aria-label={
            analysisId !== ''
              ? `View details for analysis ${analysisId}`
              : 'View details unavailable'
          }
          onClick={() => {
            if (canOpen) onOpenAnalysis?.(analysisId)
          }}
        >
          View details
        </Button>
      </td>
    </tr>
  )
}

/** Loading / populated / empty / retryable-error states for the worklist. */
function ReviewQueue({
  result,
  riskFilter,
  onRiskFilterChange,
  onRetry,
  onPage,
  onOpenAnalysis,
  oldestAwaitingAnalyzedAt,
}: {
  result: QueueResult
  riskFilter: string
  onRiskFilterChange: (value: string) => void
  onRetry: () => void
  onPage: (offset: number) => void
  onOpenAnalysis?: (analysisId: string) => void
  oldestAwaitingAnalyzedAt: string | null
}) {
  const oldest = formatWaitingAge(oldestAwaitingAnalyzedAt)

  const filter = (
    <label className="flex items-center gap-2 text-xs text-ink-500">
      <span className="font-medium">Risk level</span>
      <Select
        aria-label="Filter the review queue by risk level"
        className="h-9 w-40"
        placeholder="All risk levels"
        options={RISK_FILTER_OPTIONS}
        value={riskFilter}
        onChange={(event) => onRiskFilterChange(event.target.value)}
      />
    </label>
  )

  let body: ReactNode
  if (result.status === 'loading') {
    body = (
      <StatePanel
        variant="loading"
        title="Loading the review worklist…"
        description="Retrieving analyses that are waiting for a human decision."
      />
    )
  } else if (result.status === 'error') {
    const copy = errorCopy(result.error)
    body = (
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
    )
  } else if (result.page.items.length === 0) {
    body = (
      <StatePanel
        title="Nothing awaiting review"
        description={
          riskFilter
            ? `No analyses are awaiting review with risk level ${riskFilter}.`
            : 'Every persisted analysis has at least one recorded human review.'
        }
      />
    )
  } else {
    const { page } = result
    const first = page.total === 0 ? 0 : page.offset + 1
    const last = page.offset + page.items.length
    body = (
      <>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <caption className="sr-only">
              Analyses awaiting a human decision, highest risk first.
            </caption>
            <thead>
              <tr className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                <th scope="col" className="px-3 py-2 font-medium">
                  Analysis ID
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Claim
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Risk
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Recommendation
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Reviews
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Waiting
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((item, index) => (
                <QueueRow
                  key={item.analysis_id ?? index}
                  item={item}
                  onOpenAnalysis={onOpenAnalysis}
                />
              ))}
            </tbody>
          </table>
        </div>
        <CardFooter>
          <span className="text-xs text-ink-500">
            Showing {first}–{last} of {page.total}{' '}
            {plural(page.total, 'analysis', 'analyses')}
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page.offset <= 0}
              onClick={() => onPage(Math.max(page.offset - QUEUE_PAGE_SIZE, 0))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={last >= page.total}
              onClick={() => onPage(page.offset + QUEUE_PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </CardFooter>
      </>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardHeading
          title="Review worklist"
          description="Analyses with no recorded human review, ranked by risk score. A prioritisation aid only."
          icon={<HistoryIcon width={16} height={16} />}
        />
        {filter}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-ink-500">
          {oldest === null
            ? 'No analyses are currently waiting for review.'
            : `Oldest waiting analysis: ${oldest} since it was analysed.`}{' '}
          Waiting age is measured from the analysis timestamp and is not an SLA.
        </p>
        {body}
      </CardContent>
    </Card>
  )
}

/** The rendered dashboard for a successfully loaded summary. */
function DashboardContent({
  summary,
  queue,
  riskFilter,
  onRiskFilterChange,
  onQueueRetry,
  onQueuePage,
  onOpenAnalysis,
}: {
  summary: DashboardSummary
  queue: QueueResult
  riskFilter: string
  onRiskFilterChange: (value: string) => void
  onQueueRetry: () => void
  onQueuePage: (offset: number) => void
  onOpenAnalysis?: (analysisId: string) => void
}) {
  const { totals } = summary

  return (
    <div className="flex flex-col gap-6">
      {totals.analyses === 0 ? (
        <Callout tone="neutral" title="No persisted analyses yet">
          There are no saved analyses, so every metric below is zero. Run a new
          claim analysis to populate the dashboard.
        </Callout>
      ) : null}

      <section aria-label="Key metrics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Analyses"
            value={totals.analyses}
            helper="Persisted analysis records (not unique claims)"
            icon={<ShieldIcon width={16} height={16} />}
          />
          <StatCard
            label="Claims"
            value={totals.claims}
            helper="Distinct persisted claim records"
            icon={<UsersIcon width={16} height={16} />}
          />
          <StatCard
            label="High / critical risk"
            value={summary.high_critical_analyses}
            helper="Analyses prioritised HIGH or CRITICAL"
            icon={<AlertIcon width={16} height={16} />}
          />
          <StatCard
            label="Awaiting human review"
            value={summary.analyses_awaiting_review}
            helper="Analyses with no recorded human review"
            icon={<HistoryIcon width={16} height={16} />}
          />
          <StatCard
            label="Review records"
            value={totals.reviews}
            helper="Stored reviews (an analysis may have more than one)"
            icon={<CheckIcon width={16} height={16} />}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardHeading
              title="Risk distribution"
              description="Persisted analyses grouped by prioritisation level."
              icon={<ShieldIcon width={16} height={16} />}
            />
            <Badge tone="info">
              {totals.analyses} {plural(totals.analyses, 'analysis', 'analyses')}
            </Badge>
          </CardHeader>
          <CardContent>
            <RiskDistribution
              distribution={summary.risk_distribution}
              status={summary.risk_review_status}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardHeading
              title="Human review"
              description="Decisions recorded by human reviewers."
              icon={<CheckIcon width={16} height={16} />}
            />
            <Badge tone="info">
              {totals.reviews} {plural(totals.reviews, 'review', 'reviews')}
            </Badge>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-500">
                  Awaiting review
                </dt>
                <dd className="mt-1 text-lg font-semibold text-navy-900">
                  {summary.analyses_awaiting_review}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-500">
                  Analyses reviewed
                </dt>
                <dd className="mt-1 text-lg font-semibold text-navy-900">
                  {summary.analyses_with_reviews}
                </dd>
              </div>
            </dl>

            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Reviews by outcome
              </p>
              <div className="mt-2">
                <OutcomeList
                  counts={summary.review_outcomes}
                  emptyLabel="No reviews have been recorded yet."
                />
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Latest review outcome per analysis
              </p>
              <p className="mt-1 text-xs text-ink-500">
                The most recent review for each reviewed analysis (
                {summary.analyses_with_reviews}{' '}
                {plural(
                  summary.analyses_with_reviews,
                  'analysis',
                  'analyses',
                )}
                ). Counted by analysis, not by review.
              </p>
              <div className="mt-2">
                <OutcomeList
                  counts={summary.latest_review_outcomes}
                  emptyLabel="No reviews have been recorded yet."
                />
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Recent review records
              </p>
              <p className="mt-1 text-xs text-ink-500">
                Newest review records first. One analysis may have several, so
                these are records, not unique reviewed analyses.
              </p>
              <div className="mt-2">
                <RecentReviews items={summary.recent_reviews} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ReviewQueue
        result={queue}
        riskFilter={riskFilter}
        onRiskFilterChange={onRiskFilterChange}
        onRetry={onQueueRetry}
        onPage={onQueuePage}
        onOpenAnalysis={onOpenAnalysis}
        oldestAwaitingAnalyzedAt={summary.oldest_awaiting_analyzed_at}
      />

      <Card>
        <CardHeader>
          <CardHeading
            title="Recent activity"
            description="Latest analyses across all claims."
            icon={<HistoryIcon width={16} height={16} />}
          />
        </CardHeader>
        <RecentActivity
          items={summary.recent_analyses}
          onOpenAnalysis={onOpenAnalysis}
        />
      </Card>

      <Card>
        <CardHeader>
          <CardHeading
            title="How ClaimPilot supports your review"
            description="What the intelligence signals mean for a claims officer."
            icon={<ShieldIcon width={16} height={16} />}
          />
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              {
                title: 'Fraud probability',
                text: 'A model estimate that a claim resembles known fraud patterns. It is a signal to investigate, never a determination of fraud.',
              },
              {
                title: 'Risk score and level',
                text: 'A prioritisation score (0–100) combining fraud, anomaly and severity signals to help order your workload.',
              },
              {
                title: 'Predicted claim amount',
                text: 'An expected claim amount used as one input to prioritisation. It is not a settlement offer.',
              },
              {
                title: 'Anomaly score',
                text: 'How unusual a claim looks compared with typical claims. Unusual does not mean fraudulent.',
              },
            ].map((item) => (
              <li key={item.title} className="flex gap-3">
                <CheckIcon
                  width={18}
                  height={18}
                  className="mt-0.5 shrink-0 text-status-low"
                />
                <div>
                  <p className="text-sm font-medium text-navy-900">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-500">{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

export interface OverviewPageProps {
  /** Open the saved analysis details for a recent-activity or queue row. */
  onOpenAnalysis?: (analysisId: string) => void
}

/**
 * Dashboard landing page.
 *
 * The summary and the review queue are fetched independently: the summary on
 * mount/retry, and the queue whenever its filter or page changes. Each request
 * carries a monotonic token so an older response can never overwrite a newer
 * one. Loading is set explicitly by the handlers (never synchronously in an
 * effect body), so the previous page stays visible until a new one arrives.
 */
export function OverviewPage({ onOpenAnalysis }: OverviewPageProps = {}) {
  const [result, setResult] = useState<DashboardResult | null>(null)
  const [announcement, setAnnouncement] = useState('')
  // Bumped to re-run the summary effect for an explicit user retry.
  const [attempt, setAttempt] = useState(0)
  const requestSeq = useRef(0)

  // Review queue: its own result, filter, page and retry counter.
  const [queue, setQueue] = useState<QueueResult>({ status: 'loading' })
  const [riskFilter, setRiskFilter] = useState('')
  const [queueOffset, setQueueOffset] = useState(0)
  const [queueAttempt, setQueueAttempt] = useState(0)
  const queueSeq = useRef(0)

  useEffect(() => {
    const token = ++requestSeq.current
    let active = true

    // Only the async result updates live; loading is derived from `result`.
    getDashboardSummary()
      .then((summary) => {
        if (!active || token !== requestSeq.current) return
        setResult({ status: 'success', summary })
        setAnnouncement(
          `Dashboard loaded: ${summary.totals.analyses} analyses and ` +
            `${summary.totals.reviews} reviews.`,
        )
      })
      .catch((error: unknown) => {
        if (!active || token !== requestSeq.current) return
        const info = toDashboardError(error)
        setResult({ status: 'error', error: info })
        setAnnouncement(info.message)
      })

    return () => {
      active = false
    }
  }, [attempt])

  useEffect(() => {
    const token = ++queueSeq.current
    let active = true

    getReviewQueue({
      scope: 'awaiting',
      order: 'risk',
      limit: QUEUE_PAGE_SIZE,
      offset: queueOffset,
      riskLevel: riskFilter || undefined,
    })
      .then((page) => {
        if (!active || token !== queueSeq.current) return
        setQueue({ status: 'success', page })
      })
      .catch((error: unknown) => {
        if (!active || token !== queueSeq.current) return
        setQueue({ status: 'error', error: toDashboardError(error) })
      })

    return () => {
      active = false
    }
  }, [queueAttempt, queueOffset, riskFilter])

  function changeRiskFilter(value: string) {
    setQueue({ status: 'loading' })
    setQueueOffset(0)
    setRiskFilter(value)
  }

  function changeQueuePage(offset: number) {
    setQueue({ status: 'loading' })
    setQueueOffset(offset)
  }

  function retryQueue() {
    setQueue({ status: 'loading' })
    setQueueAttempt((n) => n + 1)
  }

  let content: ReactNode
  if (result === null) {
    content = (
      <div className="rounded-lg border border-dashed border-ink-200">
        <StatePanel
          variant="loading"
          title="Loading dashboard…"
          description="Retrieving persisted analyses and reviews from the claims database."
        />
      </div>
    )
  } else if (result.status === 'error') {
    const copy = errorCopy(result.error)
    content = (
      <div className="rounded-lg border border-dashed border-ink-200">
        <StatePanel
          variant="error"
          title={copy.title}
          description={copy.description}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setResult(null)
                setAttempt((n) => n + 1)
              }}
            >
              Try again
            </Button>
          }
        />
      </div>
    )
  } else {
    content = (
      <DashboardContent
        summary={result.summary}
        queue={queue}
        riskFilter={riskFilter}
        onRiskFilterChange={changeRiskFilter}
        onQueueRetry={retryQueue}
        onQueuePage={changeQueuePage}
        onOpenAnalysis={onOpenAnalysis}
      />
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Dashboard"
        description="Persisted claim analyses, risk distribution and human review activity."
      />

      <Callout tone="info" title="Decision support only">
        Every figure is aggregated from saved records. A high score or a review
        recommendation is never an automatic decision, a fraud probability is not
        proof of fraud, and every result requires a human decision.
      </Callout>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {content}
    </>
  )
}
