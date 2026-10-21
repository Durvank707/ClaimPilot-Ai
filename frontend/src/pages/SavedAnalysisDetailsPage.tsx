import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
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
import { Select } from '../components/ui/Select'
import { Textarea } from '../components/ui/Textarea'
import {
  AlertIcon,
  CheckIcon,
  ShieldIcon,
  UsersIcon,
} from '../components/icons'
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  getNumber,
  getString,
  isRecord,
} from '../features/claimAnalysis/formatters'
import { getAnalysisById, type SavedAnalysis } from '../api/retrieval'
import {
  createReview,
  describeReviewError,
  getAnalysisReviews,
  REVIEW_OUTCOMES,
  type Review,
  type ReviewOutcome,
} from '../api/reviews'
import { describeApiError, isApiError } from '../api/errors'

/**
 * Saved Analysis Details page.
 *
 * Retrieves one previously saved analysis by its `analysis_id` via
 * `GET /api/v1/analyses/{analysis_id}` (through `getAnalysisById`) and renders
 * the stored contract. It never runs ML inference, never submits a claim, and
 * never treats a failed request as an empty analysis.
 *
 * Score semantics (verified against the backend implementation):
 * - `fraud.probability` is a model estimate in [0, 1]; not proof of fraud.
 * - `severity.predicted_claim_amount` is a regression estimate; not the final
 *   approved or payable amount.
 * - `anomaly.score` is an unbounded isolation score; not a probability.
 * - `risk.score` is a 0–100 prioritisation score, NOT a fraud probability.
 * - `decision.recommendation` is a suggested review step, not an automatic
 *   decision; `human_decision_required` keeps the human in the loop.
 *
 * Navigation is owned by the caller: the page selects which analysis to show
 * from the `analysisId` prop and reports a back action through `onBack`. The
 * project still uses local-state navigation (no router), so no routing
 * dependency is introduced and no links to not-yet-connected routes are created.
 */

/** Shown wherever a stored value is absent, so nothing is fabricated. */
const MISSING = 'Not available'

type DetailsErrorKind = 'not-found' | 'network' | 'server' | 'unexpected'

interface DetailsError {
  kind: DetailsErrorKind
  /** Safe, user-facing detail. Never a stack trace or raw body. */
  message: string
}

/**
 * The outcome of the most recent retrieval. Loading and "no selection" are not
 * stored; they are derived during render from the requested id, so the effect
 * never has to synchronously reset state.
 */
type DetailsResult =
  | { status: 'success'; analysisId: string; analysis: SavedAnalysis }
  | { status: 'error'; analysisId: string; error: DetailsError }

/**
 * Map any retrieval failure onto a small set of UI states. A 404 is a distinct
 * "analysis not found" outcome, not an empty analysis; a network failure is
 * distinct from a server error. Raw error bodies are never surfaced.
 */
function toDetailsError(error: unknown): DetailsError {
  if (isApiError(error)) {
    if (error.kind === 'http' && error.status === 404) {
      return {
        kind: 'not-found',
        message: 'No saved analysis matches that ID.',
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
    message: 'An unexpected error occurred while loading the saved analysis.',
  }
}

function errorCopy(error: DetailsError): { title: string; description: string } {
  switch (error.kind) {
    case 'not-found':
      return {
        title: 'No saved analysis found',
        description:
          'No stored analysis matches that ID. It may have been removed, or the ID may be incorrect.',
      }
    case 'network':
      return {
        title: 'The backend could not be reached',
        description:
          'The service may be offline. Check the connection and try again.',
      }
    case 'server':
      return {
        title: 'The saved analysis could not be loaded',
        description: error.message,
      }
    case 'unexpected':
      return { title: 'Unexpected response', description: error.message }
  }
}

function MissingValue() {
  return <span className="text-ink-400">{MISSING}</span>
}

/** A labelled term/value pair. A null value is shown as an honest placeholder. */
function DetailItem({ term, value }: { term: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-500">{term}</dt>
      <dd
        className={
          value === null
            ? 'text-sm font-medium text-ink-400'
            : 'break-words text-sm font-medium text-navy-900'
        }
      >
        {value ?? MISSING}
      </dd>
    </div>
  )
}

/** A model signal shown as a prominent value plus an explanatory helper. */
function SignalStat({
  label,
  value,
  helper,
}: {
  label: string
  value: string | null
  helper: string
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
        {label}
      </p>
      <p
        className={
          value === null
            ? 'mt-1 text-xl font-semibold tracking-tight text-ink-400'
            : 'mt-1 text-xl font-semibold tracking-tight text-navy-900'
        }
      >
        {value ?? MISSING}
      </p>
      <p className="mt-1 text-xs text-ink-500">{helper}</p>
    </div>
  )
}

function TextList({
  items,
  emptyLabel,
}: {
  items: unknown[]
  emptyLabel: string
}) {
  const values = items.map((item) => String(item))
  if (values.length === 0) {
    return <p className="mt-1 text-xs text-ink-500">{emptyLabel}</p>
  }
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-600">
      {values.map((value, index) => (
        <li key={`${index}-${value}`}>{value}</li>
      ))}
    </ul>
  )
}

/** Accessible horizontal 0..max bar, used only where the scale is established. */
function ScoreBar({
  value,
  max = 100,
  label,
  tone = 'bg-accent-600',
}: {
  value: number
  max?: number
  label: string
  tone?: string
}) {
  const clamped = Math.max(0, Math.min(max, value))
  const pct = (clamped / max) * 100
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(clamped * 10) / 10}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-ink-100"
    >
      <div
        className={`h-full rounded-full ${tone}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function ComponentRow({
  title,
  valueText,
  barValue = null,
  barMax = 100,
  barTone,
  helper,
}: {
  title: string
  valueText: string
  barValue?: number | null
  barMax?: number
  barTone?: string
  helper?: string
}) {
  const hasBar = barValue !== null && Number.isFinite(barValue)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-sm font-medium text-navy-800">{title}</p>
        <p className="text-sm font-semibold text-navy-900">{valueText}</p>
      </div>
      {hasBar ? (
        <ScoreBar
          value={barValue as number}
          max={barMax}
          label={`${title}: ${valueText}`}
          tone={barTone}
        />
      ) : null}
      {helper ? <p className="text-xs text-ink-500">{helper}</p> : null}
    </div>
  )
}

function riskBarTone(level: string | null): string {
  switch (level) {
    case 'CRITICAL':
      return 'bg-status-critical'
    case 'HIGH':
      return 'bg-status-high'
    case 'MEDIUM':
      return 'bg-status-medium'
    case 'LOW':
      return 'bg-status-low'
    default:
      return 'bg-accent-600'
  }
}

/**
 * Risk component values, read only from the stored `risk.components` payload.
 *
 * The backend stores exactly `fraud` (probability × 100), `anomaly` (raw score
 * × 100, unbounded) and `severity` (0–100 percentile). Components that are
 * absent are not rendered; unbounded ones are never placed on a 0–100 bar.
 */
function RiskComponents({
  components,
}: {
  components: Record<string, unknown> | null
}) {
  const empty = (
    <p className="text-sm text-ink-600">
      No risk component breakdown was saved for this analysis.
    </p>
  )

  if (components === null || Object.keys(components).length === 0) return empty

  const hasFraud = 'fraud' in components
  const hasAnomaly = 'anomaly' in components
  const hasSeverity = 'severity' in components
  if (!hasFraud && !hasAnomaly && !hasSeverity) return empty

  const fraud = getNumber(components, 'fraud')
  const anomaly = getNumber(components, 'anomaly')
  const severity = getNumber(components, 'severity')

  return (
    <div className="flex flex-col gap-4">
      {hasFraud ? (
        <ComponentRow
          title="Fraud signal"
          valueText={
            fraud !== null ? `${formatNumber(fraud, 1)} of 100` : MISSING
          }
          barValue={fraud}
          barTone="bg-status-medium"
          helper="Component = fraud probability × 100."
        />
      ) : null}

      {hasAnomaly ? (
        <div className="space-y-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-sm font-medium text-navy-800">Anomaly signal</p>
            <p className="text-sm font-semibold text-navy-900">
              {anomaly !== null ? formatNumber(anomaly, 3) : MISSING}
            </p>
          </div>
          <p className="text-xs text-ink-500">
            Unbounded component (raw anomaly score × 100). Higher means more
            unusual; it is not a percentage, so it is not shown on a 0–100 bar.
          </p>
        </div>
      ) : null}

      {hasSeverity ? (
        <ComponentRow
          title="Severity signal"
          valueText={
            severity !== null
              ? `${formatNumber(severity, 1)} percentile`
              : MISSING
          }
          barValue={severity}
          barTone="bg-accent-600"
          helper="Percentile of the predicted amount against training claims."
        />
      ) : null}
    </div>
  )
}

function ExplanationCard({
  explanation,
}: {
  explanation: Record<string, unknown> | null
}) {
  const risk = explanation && isRecord(explanation.risk) ? explanation.risk : {}
  const summary = getString(risk, 'summary')
  const fraud =
    explanation && isRecord(explanation.fraud)
      ? getNumber(explanation.fraud, 'probability')
      : null
  const anomaly =
    explanation && isRecord(explanation.anomaly)
      ? getNumber(explanation.anomaly, 'score')
      : null
  const severity =
    explanation && isRecord(explanation.severity)
      ? getNumber(explanation.severity, 'predicted_amount')
      : null

  const hasModelValues = fraud !== null || anomaly !== null || severity !== null
  const hasExplanation = summary !== null || hasModelValues

  return (
    <Card>
      <CardHeader>
        <CardHeading
          title="Explanation"
          description="Saved explanation payload for this analysis."
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!hasExplanation ? (
          <p className="text-sm text-ink-600">
            No saved explanation is available for this analysis.
          </p>
        ) : (
          <>
            {summary ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                  Risk summary
                </p>
                <p className="mt-1 text-sm text-ink-700">{summary}</p>
              </div>
            ) : null}

            {hasModelValues ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                  Model-level values
                </p>
                <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
                  <DetailItem
                    term="Fraud probability"
                    value={formatPercent(fraud, { decimals: 1 })}
                  />
                  <DetailItem
                    term="Anomaly score"
                    value={formatNumber(anomaly, 3)}
                  />
                  <DetailItem
                    term="Predicted amount"
                    value={formatCurrency(severity)}
                  />
                </dl>
              </div>
            ) : null}

            <p className="text-xs text-ink-500">
              These are the values stored with the analysis. No feature-level
              contributions or rule-based reasons are included, so none are
              shown, and no causal claims are made from these values.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function DecisionCard({
  decision,
}: {
  decision: Record<string, unknown> | null
}) {
  const recommendation = decision ? getString(decision, 'recommendation') : null
  const priority = decision ? getString(decision, 'priority') : null
  const policyVersion = decision ? getString(decision, 'policy_version') : null
  const humanRequired = decision
    ? decision.human_decision_required === true
    : false
  const reasons =
    decision && Array.isArray(decision.reasons) ? decision.reasons : []
  const actions =
    decision && Array.isArray(decision.suggested_actions)
      ? decision.suggested_actions
      : []
  const triggered =
    decision && Array.isArray(decision.triggered_rules)
      ? decision.triggered_rules
      : []

  const hasContent =
    recommendation !== null ||
    priority !== null ||
    policyVersion !== null ||
    humanRequired ||
    reasons.length > 0 ||
    actions.length > 0 ||
    triggered.length > 0

  return (
    <Card>
      <CardHeader>
        <CardHeading
          title="Review recommendation"
          description="Saved decision-engine output. A recommendation is not an automatic decision."
        />
        {recommendation ? (
          <Badge tone="info">{recommendation}</Badge>
        ) : (
          <Badge tone="neutral">Not available</Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!hasContent ? (
          <p className="text-sm text-ink-600">
            No saved review recommendation is available for this analysis.
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
              <DetailItem term="Recommendation" value={recommendation} />
              <DetailItem term="Priority" value={priority} />
              <DetailItem
                term="Policy / rules version"
                value={policyVersion}
              />
            </dl>

            {humanRequired ? (
              <Callout
                tone="warning"
                title="Human decision required"
                icon={<ShieldIcon width={18} height={18} />}
              >
                This saved analysis requires a human claims officer decision. The
                recommendation is a suggested review step, not an approval or a
                rejection.
              </Callout>
            ) : (
              <p className="text-xs text-ink-500">
                A human decision requirement was not recorded as required for this
                analysis. The recommendation is still not an automatic decision.
              </p>
            )}

            <div>
              <p className="text-sm font-medium text-navy-800">Reasons</p>
              <TextList
                items={reasons}
                emptyLabel="No reasons were recorded."
              />
            </div>

            <div>
              <p className="text-sm font-medium text-navy-800">
                Suggested actions
              </p>
              <TextList
                items={actions}
                emptyLabel="No suggested actions were recorded."
              />
            </div>

            <div>
              <p className="text-sm font-medium text-navy-800">
                Triggered rules
              </p>
              <TextList
                items={triggered}
                emptyLabel="No rules were triggered."
              />
            </div>
          </>
        )}
      </CardContent>
      <CardFooter>
        <p className="text-xs text-ink-500">
          Recommendations support a human claims officer. ClaimPilot never
          approves, rejects or accuses a claim automatically.
        </p>
      </CardFooter>
    </Card>
  )
}

function SavedAnalysisDetails({ analysis }: { analysis: SavedAnalysis }) {
  const riskScore = analysis.risk.score
  const riskLevel = analysis.risk.level
  const fraudProb = analysis.fraud.probability
  const predAmount = analysis.severity.predicted_claim_amount
  const anomalyScore = analysis.anomaly.score

  return (
    <div className="flex flex-col gap-6">
      {/* A. Analysis summary */}
      <Card>
        <CardHeader>
          <CardHeading
            title="Analysis summary"
            description="Stored record of this saved analysis."
            icon={<ShieldIcon width={16} height={16} />}
          />
          {analysis.analysis_id ? (
            <Badge tone="info">Analysis ID: {analysis.analysis_id}</Badge>
          ) : (
            <Badge tone="neutral">Analysis ID not available</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            <DetailItem term="Analysis ID" value={analysis.analysis_id} />
            <DetailItem term="Related claim ID" value={analysis.claim_id} />
            <DetailItem
              term="Analysis date"
              value={formatDate(analysis.analyzed_at)}
            />
            <DetailItem
              term="Overall risk score"
              value={formatNumber(riskScore, 1)}
            />
            <div className="min-w-0">
              <dt className="text-xs text-ink-500">Overall risk level</dt>
              <dd className="mt-0.5">
                {riskLevel ? <RiskBadge level={riskLevel} /> : <MissingValue />}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-ink-500">
            The overall risk score is a 0–100 prioritisation measure, not a
            probability of fraud. The analysis ID and claim ID are identifiers
            only; their presence is not a judgement about the claim.
          </p>
        </CardContent>
      </Card>

      {/* B/C/D. Model signals */}
      <Card>
        <CardHeader>
          <CardHeading
            title="Model signals"
            description="Model outputs returned in this saved analysis."
          />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <SignalStat
              label="Fraud probability"
              value={formatPercent(fraudProb, { decimals: 1 })}
              helper="Model-estimated likelihood. Not proof of fraud and not a decision."
            />
            <SignalStat
              label="Predicted claim amount"
              value={formatCurrency(predAmount)}
              helper="Estimate from the severity model. Not the final approved or payable amount."
            />
            <SignalStat
              label="Anomaly score"
              value={formatNumber(anomalyScore, 3)}
              helper="How unusual the claim appears to the anomaly detector. Not a fraud probability; the score is unbounded."
            />
          </div>
        </CardContent>
      </Card>

      {/* E. Risk breakdown */}
      <Card>
        <CardHeader>
          <CardHeading
            title="Risk breakdown"
            description="Overall risk score and the component values stored with this analysis."
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <ComponentRow
            title="Overall risk score"
            valueText={
              riskScore !== null
                ? `${formatNumber(riskScore, 1)} / 100${
                    riskLevel ? ` (${riskLevel})` : ''
                  }`
                : MISSING
            }
            barValue={riskScore}
            barTone={riskBarTone(riskLevel)}
            helper="0–100 prioritisation score. It is not a probability of fraud."
          />

          <div className="border-t border-ink-200 pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-500">
              Signal components
            </p>
            <RiskComponents components={analysis.risk.components} />
          </div>
        </CardContent>
      </Card>

      {/* F. Explanation */}
      <ExplanationCard explanation={analysis.explanation} />

      {/* G. Review recommendation and human oversight */}
      <DecisionCard decision={analysis.decision} />
    </div>
  )
}

type ReviewsState =
  | { analysisId: string; status: 'success'; reviews: Review[] }
  | { analysisId: string; status: 'error'; message: string }

type ReviewSubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; review: Review }
  | { status: 'error' }

/** Colour-coded tone for a recorded human outcome (never the sole signal). */
function outcomeTone(
  outcome: string | null,
): 'low' | 'critical' | 'medium' | 'high' | 'neutral' {
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

/** Map a failed reviews request onto a safe message. 404 is not "no reviews". */
function reviewLoadMessage(error: unknown): string {
  if (isApiError(error) && error.kind === 'http' && error.status === 404) {
    return 'This analysis is no longer available, so its reviews could not be loaded.'
  }
  return describeApiError(error)
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
    />
  )
}

/** A single previously saved human review. */
function SavedReviewItem({ review }: { review: Review }) {
  const notes =
    review.comments && review.comments.trim() !== '' ? review.comments : null
  return (
    <li className="rounded-lg border border-ink-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone={outcomeTone(review.final_decision)} withDot>
          {review.final_decision ?? 'Not available'}
        </Badge>
        <span className="text-xs text-ink-500">
          {formatDate(review.reviewed_at) ?? MISSING}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <DetailItem term="Reviewer" value={review.reviewer_id} />
        <DetailItem term="Review ID" value={review.review_id} />
      </dl>
      <div className="mt-2">
        <p className="text-xs text-ink-500">Notes</p>
        <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-700">
          {notes ?? MISSING}
        </p>
      </div>
    </li>
  )
}

/**
 * Human review panel.
 *
 * Shows the reviews already saved for this analysis and lets a human reviewer
 * record a new one. The reviewer chooses the outcome; the platform only stores
 * it. After a successful save the panel re-fetches the reviews so the displayed
 * data reflects what was persisted.
 */
function HumanReviewPanel({ analysisId }: { analysisId: string }) {
  const [reviews, setReviews] = useState<ReviewsState | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reviewsSeq = useRef(0)

  const [outcome, setOutcome] = useState('')
  const [reviewerId, setReviewerId] = useState('')
  const [notes, setNotes] = useState('')
  const [outcomeError, setOutcomeError] = useState<string | undefined>(undefined)
  const [submitError, setSubmitError] = useState<string | undefined>(undefined)
  const [submission, setSubmission] = useState<ReviewSubmitState>({
    status: 'idle',
  })
  const [announcement, setAnnouncement] = useState('')
  // Synchronous guard so a rapid double-activation cannot start two requests.
  const inFlight = useRef(false)

  useEffect(() => {
    const token = ++reviewsSeq.current
    let active = true

    getAnalysisReviews(analysisId)
      .then((items) => {
        if (!active || token !== reviewsSeq.current) return
        setReviews({ analysisId, status: 'success', reviews: items })
      })
      .catch((error: unknown) => {
        if (!active || token !== reviewsSeq.current) return
        setReviews({
          analysisId,
          status: 'error',
          message: reviewLoadMessage(error),
        })
      })

    return () => {
      active = false
    }
  }, [analysisId, reloadKey])

  // A result for a different analysis is stale; treat it as "not loaded yet".
  const currentReviews =
    reviews !== null && reviews.analysisId === analysisId ? reviews : null

  const refresh = () => {
    setReviews(null)
    setReloadKey((n) => n + 1)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current) return

    if (outcome.trim() === '') {
      setOutcomeError('Select a review outcome.')
      setSubmission({ status: 'idle' })
      setAnnouncement('Review not saved. Select a review outcome.')
      return
    }

    inFlight.current = true
    setOutcomeError(undefined)
    setSubmitError(undefined)
    setSubmission({ status: 'submitting' })
    setAnnouncement('Saving the human review.')

    try {
      const review = await createReview(analysisId, {
        final_decision: outcome as ReviewOutcome,
        reviewer_id: reviewerId,
        comments: notes,
      })
      setSubmission({ status: 'success', review })
      setOutcome('')
      setReviewerId('')
      setNotes('')
      setAnnouncement('Review saved.')
      // Refresh the displayed reviews from the server after a successful save.
      refresh()
    } catch (error) {
      const info = describeReviewError(error)
      if (info.fieldErrors.final_decision) {
        setOutcomeError(info.fieldErrors.final_decision)
      }
      setSubmitError(info.message)
      setSubmission({ status: 'error' })
      setAnnouncement('The review could not be saved.')
    } finally {
      inFlight.current = false
    }
  }

  const submitting = submission.status === 'submitting'
  const savedReviews =
    currentReviews?.status === 'success' ? currentReviews.reviews : null

  return (
    <Card>
      <CardHeader>
        <CardHeading
          title="Human review"
          description="Saved reviews for this analysis and the reviewer's decision."
          icon={<UsersIcon width={16} height={16} />}
        />
        {savedReviews ? (
          <Badge tone={savedReviews.length > 0 ? 'info' : 'neutral'}>
            {savedReviews.length}{' '}
            {savedReviews.length === 1 ? 'review' : 'reviews'}
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div>
          <p className="text-sm font-medium text-navy-800">Saved reviews</p>

          {currentReviews === null ? (
            <p className="mt-1 text-sm text-ink-500">Loading saved reviews…</p>
          ) : null}

          {currentReviews?.status === 'error' ? (
            <Callout
              tone="warning"
              title="Saved reviews could not be loaded"
              icon={<AlertIcon width={18} height={18} />}
              className="mt-2"
            >
              <p>{currentReviews.message}</p>
              <div className="mt-2">
                <Button variant="secondary" size="sm" onClick={refresh}>
                  Try again
                </Button>
              </div>
            </Callout>
          ) : null}

          {savedReviews && savedReviews.length === 0 ? (
            <p className="mt-1 text-sm text-ink-600">
              No human review has been recorded for this analysis yet.
            </p>
          ) : null}

          {savedReviews && savedReviews.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-3">
              {savedReviews.map((review) => (
                <SavedReviewItem key={review.review_id} review={review} />
              ))}
            </ul>
          ) : null}
        </div>

        <div className="border-t border-ink-200 pt-4">
          <p className="text-sm font-medium text-navy-800">Record a review</p>
          <p className="mt-1 text-xs text-ink-500">
            Your decision is stored against this analysis. ClaimPilot does not
            decide — the human reviewer does.
          </p>

          {submission.status === 'success' ? (
            <Callout
              tone="success"
              title="Review saved"
              icon={<CheckIcon width={18} height={18} />}
              className="mt-3"
            >
              Outcome recorded as{' '}
              {submission.review.final_decision ?? 'Not available'}.
            </Callout>
          ) : null}

          {submitError ? (
            <Callout
              tone="warning"
              title="The review could not be saved"
              icon={<AlertIcon width={18} height={18} />}
              className="mt-3"
            >
              <p>{submitError}</p>
            </Callout>
          ) : null}

          <form
            noValidate
            autoComplete="off"
            aria-label="Human review form"
            onSubmit={handleSubmit}
            className="mt-4 flex flex-col gap-4"
          >
            <fieldset className="min-w-0 border-0 p-0" disabled={submitting}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  label="Outcome"
                  required
                  error={outcomeError}
                  hint="The decision you are recording."
                >
                  {({ id, describedBy, invalid }) => (
                    <Select
                      id={id}
                      name="final_decision"
                      value={outcome}
                      options={REVIEW_OUTCOMES}
                      invalid={invalid}
                      aria-describedby={describedBy}
                      onChange={(event) => {
                        setOutcome(event.target.value)
                        if (outcomeError !== undefined) setOutcomeError(undefined)
                      }}
                    />
                  )}
                </FormField>

                <FormField
                  label="Reviewer ID"
                  hint="Your officer/reviewer identifier (optional)."
                >
                  {({ id, describedBy }) => (
                    <Input
                      id={id}
                      name="reviewer_id"
                      type="text"
                      value={reviewerId}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="e.g. OFFICER-123"
                      aria-describedby={describedBy}
                      onChange={(event) => setReviewerId(event.target.value)}
                    />
                  )}
                </FormField>
              </div>

              <div className="mt-4">
                <FormField
                  label="Notes"
                  hint="Optional context for this decision."
                >
                  {({ id, describedBy }) => (
                    <Textarea
                      id={id}
                      name="comments"
                      rows={3}
                      value={notes}
                      aria-describedby={describedBy}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  )}
                </FormField>
              </div>
            </fieldset>

            <div className="flex items-center justify-end gap-2">
              <Button type="submit" disabled={submitting} aria-busy={submitting}>
                {submitting ? (
                  <>
                    <Spinner />
                    Saving…
                  </>
                ) : (
                  <>
                    <CheckIcon width={16} height={16} />
                    Save review
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>

        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      </CardContent>

      <CardFooter>
        <p className="text-xs text-ink-500">
          Reviews record a human decision. The platform never approves, rejects,
          denies or accuses a claim automatically.
        </p>
      </CardFooter>
    </Card>
  )
}

export interface SavedAnalysisDetailsPageProps {
  /**
   * The saved analysis to display. A blank/null value means no analysis is
   * selected, and no request is sent.
   */
  analysisId: string | null
  /** Return to the previous screen. Wired by the navigation owner. */
  onBack?: () => void
}

export function SavedAnalysisDetailsPage({
  analysisId,
  onBack,
}: SavedAnalysisDetailsPageProps) {
  const [result, setResult] = useState<DetailsResult | null>(null)
  const [announcement, setAnnouncement] = useState('')
  // Bumped to re-run the effect for an explicit user retry of the same id.
  const [attempt, setAttempt] = useState(0)
  // Monotonic token: an older response can never overwrite a newer one.
  const requestSeq = useRef(0)

  useEffect(() => {
    const id = (analysisId ?? '').trim()
    if (id === '') return
    const token = ++requestSeq.current
    let active = true

    // Only the async result updates live here; loading is derived from render.
    getAnalysisById(id)
      .then((analysis) => {
        if (!active || token !== requestSeq.current) return
        setResult({ status: 'success', analysisId: id, analysis })
        setAnnouncement(`Saved analysis ${id} loaded.`)
      })
      .catch((error: unknown) => {
        if (!active || token !== requestSeq.current) return
        const info = toDetailsError(error)
        setResult({ status: 'error', analysisId: id, error: info })
        setAnnouncement(info.message)
      })

    return () => {
      active = false
    }
  }, [analysisId, attempt])

  const currentId = (analysisId ?? '').trim()
  // Only a result for the currently requested id may be shown. A result for a
  // previously selected id is treated as "still loading", so stale details are
  // hidden as a new analysis loads.
  const current = result !== null && result.analysisId === currentId ? result : null

  let content: ReactNode
  if (currentId === '') {
    content = (
      <div className="rounded-lg border border-dashed border-ink-200">
        <StatePanel
          title="No saved analysis selected"
          description="Open a saved analysis from the claims history to see its details. Nothing is requested until an analysis is selected."
        />
      </div>
    )
  } else if (current?.status === 'success') {
    content = (
      <div className="flex flex-col gap-6">
        <SavedAnalysisDetails analysis={current.analysis} />
        <HumanReviewPanel analysisId={current.analysisId} />
      </div>
    )
  } else if (current?.status === 'error') {
    const copy = errorCopy(current.error)
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
    // In-flight request, or the brief window after the selected analysis
    // changes but before its request resolves.
    content = (
      <div className="rounded-lg border border-dashed border-ink-200">
        <StatePanel
          variant="loading"
          title="Loading saved analysis…"
          description={`Retrieving “${currentId}” from the claims database.`}
        />
      </div>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Retrieve"
        title="Saved Analysis"
        description="A previously saved analysis result, shown for a human claims officer."
        actions={
          onBack ? (
            <Button variant="secondary" onClick={onBack}>
              Back
            </Button>
          ) : undefined
        }
      />

      <Callout tone="info" title="Decision support only">
        This is a stored analysis result. A high score or a review recommendation
        is never an automatic decision, a fraud probability is not proof of
        fraud, and every result requires a human decision.
      </Callout>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {content}
    </>
  )
}
