import type { ReactNode } from 'react'
import { Callout } from '../../components/ui/Callout'
import {
  Card,
  CardContent,
  CardHeader,
  CardHeading,
} from '../../components/ui/Card'
import { Badge, RiskBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import type { ClaimAnalysisResponse } from '../../api/claims'
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  getNumber,
  getString,
  isRecord,
} from './formatters'

/**
 * Detailed analysis results dashboard.
 *
 * Renders the *actual* response returned by `POST /api/v1/claims/analyze`.
 * The backend response shape is owned by `backend/schemas.py` and the
 * `ClaimAnalyzer.analyze` implementation; every value below is read straight
 * from that payload. Nothing is fabricated: when a field is absent or not a
 * finite number, the UI says so instead of inventing a value.
 *
 * Score semantics (verified against the backend implementation):
 * - `fraud.probability` — model probability in [0, 1]; shown as a percentage.
 *   It is an estimate, never proof, and never a decision.
 * - `severity.predicted_claim_amount` — regression output in currency; an
 *   estimate, not a guaranteed payout.
 * - `anomaly.score` — `-IsolationForest.decision_function`, unbounded and not a
 *   probability. Higher means *more* unusual; the model's inlier/outlier
 *   boundary is near 0.
 * - `risk.score` — prioritization score in [0, 100] that combines fraud,
 *   anomaly and severity signals using the configured weights. It is NOT a
 *   fraud probability.
 */

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

/** Accessible horizontal 0..max bar used for score visualisation. */
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

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string
  value: string
  helper: string
}) {
  const missing = value === 'Not returned'
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
        {label}
      </p>
      <p
        className={
          missing
            ? 'mt-3 text-2xl font-semibold tracking-tight text-ink-400'
            : 'mt-3 text-2xl font-semibold tracking-tight text-navy-900'
        }
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-ink-500">{helper}</p>
    </Card>
  )
}

/** A labelled signal row with an optional bar and visible text equivalent. */
function SignalRow({
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

/** Anomaly is unbounded, so it gets a value + direction note, not a 0-100 bar. */
function AnomalyRow({ score }: { score: number | null }) {
  const direction =
    score === null
      ? null
      : score > 0
        ? 'above the model’s typical level — more unusual'
        : score < 0
          ? 'below the model’s typical level — less unusual'
          : 'at the model’s typical level'
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-sm font-medium text-navy-800">Anomaly signal</p>
        <p className="text-sm font-semibold text-navy-900">
          {score !== null ? formatNumber(score, 3) : 'Not returned'}
        </p>
      </div>
      <p className="text-xs text-ink-500">
        Unbounded isolation score. Higher means more unusual; it is not a
        probability or percentage, so it is not shown on a 0–100 bar.
        {direction ? ` This claim is ${direction}.` : ''}
      </p>
    </div>
  )
}

function DefinitionItem({
  term,
  children,
  muted = false,
}: {
  term: string
  children: ReactNode
  muted?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-500">{term}</dt>
      <dd
        className={
          muted
            ? 'text-sm font-medium text-ink-400'
            : 'text-sm font-medium text-navy-900'
        }
      >
        {children}
      </dd>
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

export interface AnalysisResultsDashboardProps {
  response: ClaimAnalysisResponse
  onStartAnother: () => void
}

export function AnalysisResultsDashboard({
  response,
  onStartAnother,
}: AnalysisResultsDashboardProps) {
  const fraud = isRecord(response.fraud) ? response.fraud : {}
  const severity = isRecord(response.severity) ? response.severity : {}
  const anomaly = isRecord(response.anomaly) ? response.anomaly : {}
  const risk = isRecord(response.risk) ? response.risk : {}
  const explanation = isRecord(response.explanation) ? response.explanation : {}
  const decision = isRecord(response.decision) ? response.decision : {}

  const fraudProb = getNumber(fraud, 'probability')
  const predAmount = getNumber(severity, 'predicted_claim_amount')
  const anomalyScore = getNumber(anomaly, 'score')
  const riskScore = getNumber(risk, 'score')
  const riskLevel = getString(risk, 'level') ?? getString(decision, 'risk_level')

  // Risk components as returned by the explainer:
  // fraud = probability x 100, anomaly = raw anomaly x 100, severity = percentile.
  const explainedRisk = isRecord(explanation.risk) ? explanation.risk : {}
  const riskComponents = isRecord(explainedRisk.components)
    ? explainedRisk.components
    : {}
  const compFraud = getNumber(riskComponents, 'fraud')
  const compAnomaly = getNumber(riskComponents, 'anomaly')
  const compSeverity = getNumber(riskComponents, 'severity')
  const riskSummary = getString(explainedRisk, 'summary')

  // Explanation-owned copies of the model signals (distinct from the top-level
  // sections in the contract).
  const explainedFraud = isRecord(explanation.fraud) ? explanation.fraud : {}
  const explainedAnomaly = isRecord(explanation.anomaly)
    ? explanation.anomaly
    : {}
  const explainedSeverity = isRecord(explanation.severity)
    ? explanation.severity
    : {}
  const expFraudProb = getNumber(explainedFraud, 'probability')
  const expAnomalyScore = getNumber(explainedAnomaly, 'score')
  const expPredAmount = getNumber(explainedSeverity, 'predicted_amount')

  const recommendation = getString(decision, 'recommendation')
  const priority = getString(decision, 'priority')
  const reasons = Array.isArray(decision.reasons) ? decision.reasons : []
  const actions = Array.isArray(decision.suggested_actions)
    ? decision.suggested_actions
    : []
  const triggered = Array.isArray(decision.triggered_rules)
    ? decision.triggered_rules
    : []
  const policyVersion = getString(decision, 'policy_version')
  const humanRequired = decision.human_decision_required === true

  const hasExplanation =
    riskSummary !== null ||
    expFraudProb !== null ||
    expAnomalyScore !== null ||
    expPredAmount !== null

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Analysis header */}
      <Card>
        <CardHeader>
          <CardHeading
            title="Claim Analysis"
            description="Results returned by the analysis service. Decision support for a human claims officer."
          />
          <div className="flex flex-wrap items-center gap-2">
            {riskLevel ? <RiskBadge level={riskLevel} /> : null}
            <Badge tone={response.claim_id ? 'info' : 'neutral'}>
              {response.claim_id
                ? `Claim ID: ${response.claim_id}`
                : 'Claim ID not returned'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Callout tone="info" title="Decision support only">
            ClaimPilot assists a human reviewer. It does not approve, reject or
            accuse a claim, and no score below is proof of fraud. Every result
            requires a human decision.
          </Callout>
          <p className="text-xs text-ink-500">
            This dashboard renders the analysis response held in memory. It does
            not confirm that the claim was saved to the claims database.
          </p>
        </CardContent>
      </Card>

      {/* 2. Key metrics */}
      <section aria-labelledby="key-metrics-heading" className="space-y-3">
        <h2
          id="key-metrics-heading"
          className="text-sm font-semibold text-navy-900"
        >
          Key metrics
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Fraud probability"
            value={formatPercent(fraudProb, { decimals: 1 }) ?? 'Not returned'}
            helper="Model-estimated likelihood. Not proof and not a decision."
          />
          <MetricCard
            label="Predicted claim amount"
            value={formatCurrency(predAmount) ?? 'Not returned'}
            helper="Estimate from the severity model; payouts are not guaranteed."
          />
          <MetricCard
            label="Anomaly score"
            value={formatNumber(anomalyScore, 3) ?? 'Not returned'}
            helper="Higher means more unusual. Not a probability."
          />
          <MetricCard
            label="Overall risk score"
            value={formatNumber(riskScore, 1) ?? 'Not returned'}
            helper="0–100 prioritization score. Not a fraud probability."
          />
        </div>
      </section>

      {/* 3. Risk breakdown */}
      <Card>
        <CardHeader>
          <CardHeading
            title="Risk Breakdown"
            description="Overall risk score and the signal components returned by the model."
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <SignalRow
            title="Overall risk score"
            valueText={
              riskScore !== null
                ? `${formatNumber(riskScore, 1)} / 100${
                    riskLevel ? ` (${riskLevel})` : ''
                  }`
                : 'Not returned'
            }
            barValue={riskScore}
            barTone={riskBarTone(riskLevel)}
            helper="0–100. The level indicates prioritization only; no automatic decision is made."
          />

          <div className="border-t border-ink-200 pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-500">
              Signal components
            </p>
            <div className="flex flex-col gap-4">
              <SignalRow
                title="Fraud signal"
                valueText={
                  compFraud !== null
                    ? `${formatNumber(compFraud, 1)} of 100`
                    : 'Not returned'
                }
                barValue={compFraud}
                barTone="bg-status-medium"
                helper="Component = fraud probability × 100."
              />
              <AnomalyRow score={compAnomaly ?? anomalyScore} />
              <SignalRow
                title="Severity signal"
                valueText={
                  compSeverity !== null
                    ? `${formatNumber(compSeverity, 1)} percentile`
                    : 'Not returned'
                }
                barValue={compSeverity}
                barTone="bg-accent-600"
                helper="Percentile of the predicted amount against training claims."
              />
            </div>
            <p className="mt-3 text-xs text-ink-500">
              Components are the values returned by the model. The overall score
              applies configured weights to them; the weighting is not
              recalculated here.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 4. Explanation */}
      <Card>
        <CardHeader>
          <CardHeading
            title="Explanation"
            description="Readable view of the explanation data returned by the backend."
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!hasExplanation ? (
            <p className="text-sm text-ink-600">
              No explanation data was returned for this analysis.
            </p>
          ) : (
            <>
              {riskSummary ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                    Risk summary
                  </p>
                  <p className="mt-1 text-sm text-ink-700">{riskSummary}</p>
                </div>
              ) : null}

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                  Descriptive explanations (model-level)
                </p>
                <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
                  <DefinitionItem term="Fraud probability">
                    {formatPercent(expFraudProb, { decimals: 1 }) ?? 'Not returned'}
                  </DefinitionItem>
                  <DefinitionItem term="Anomaly score">
                    {expAnomalyScore !== null
                      ? formatNumber(expAnomalyScore, 3)
                      : 'Not returned'}
                  </DefinitionItem>
                  <DefinitionItem term="Predicted amount">
                    {formatCurrency(expPredAmount) ?? 'Not returned'}
                  </DefinitionItem>
                </dl>
              </div>
            </>
          )}

          <p className="text-xs text-ink-500">
            This API version returns model-level numeric explanations only. No
            feature-level contributions or rule-based reasons were included, so
            none are shown. No causal claims are made from these values.
          </p>
        </CardContent>
      </Card>

      {/* 5. Recommended actions */}
      <Card>
        <CardHeader>
          <CardHeading
            title="Recommended Actions"
            description="Decision-engine output using the backend's actual values."
          />
          {recommendation ? (
            <Badge tone="info">{recommendation}</Badge>
          ) : (
            <Badge tone="neutral">Not returned</Badge>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
            <DefinitionItem term="Recommendation">
              {recommendation ?? 'Not returned'}
            </DefinitionItem>
            <DefinitionItem term="Priority">
              {priority ?? 'Not returned'}
            </DefinitionItem>
            <DefinitionItem term="Human decision required">
              {humanRequired ? 'Yes' : 'Not specified'}
            </DefinitionItem>
          </dl>

          <div>
            <p className="text-sm font-medium text-navy-800">Reasons</p>
            <TextList items={reasons} emptyLabel="No reasons returned." />
          </div>

          <div>
            <p className="text-sm font-medium text-navy-800">Suggested actions</p>
            <TextList
              items={actions}
              emptyLabel="No suggested actions returned."
            />
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            <DefinitionItem term="Triggered rules">
              {triggered.length ? triggered.map(String).join(', ') : 'None'}
            </DefinitionItem>
            <DefinitionItem term="Policy version">
              {policyVersion ?? 'Not specified'}
            </DefinitionItem>
          </dl>
        </CardContent>
      </Card>

      {/* 6. Human review notice + next action */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-xs text-ink-500">
            This dashboard assists a human reviewer. It never automatically
            approves, rejects, or accuses a claim.
          </p>
          <Button type="button" onClick={onStartAnother}>
            Start another analysis
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
