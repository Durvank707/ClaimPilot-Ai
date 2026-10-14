import { PageHeader } from '../components/ui/PageHeader'
import { StatCard } from '../components/ui/StatCard'
import { Callout } from '../components/ui/Callout'
import { Card, CardContent, CardHeader, CardHeading } from '../components/ui/Card'
import { RiskBadge } from '../components/ui/Badge'
import { StatePanel } from '../components/ui/StatePanel'
import { AlertIcon, CheckIcon, HistoryIcon, ShieldIcon, UsersIcon } from '../components/icons'

const RISK_DISTRIBUTION = [
  { level: 'LOW', share: 62 },
  { level: 'MEDIUM', share: 24 },
  { level: 'HIGH', share: 10 },
  { level: 'CRITICAL', share: 4 },
]

const barTone: Record<string, string> = {
  LOW: 'bg-status-low',
  MEDIUM: 'bg-status-medium',
  HIGH: 'bg-status-high',
  CRITICAL: 'bg-status-critical',
}

export function OverviewPage() {
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Overview"
        description="A summary of claim activity, risk distribution and items awaiting human review."
      />

      <Callout tone="neutral" title="Illustrative preview">
        This dashboard is not yet connected to the ClaimPilot API. The figures
        below are illustrative examples that show the intended layout — they are
        not records from the database.
      </Callout>

      <section aria-label="Key metrics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Awaiting review"
            value="18"
            helper="Claims recommended for a human decision"
            icon={<UsersIcon width={16} height={16} />}
            illustrative
          />
          <StatCard
            label="Analysed this week"
            value="142"
            helper="Claims scored by the pipeline"
            icon={<HistoryIcon width={16} height={16} />}
            illustrative
          />
          <StatCard
            label="High / critical risk"
            value="21"
            helper="Prioritised for enhanced review"
            icon={<AlertIcon width={16} height={16} />}
            illustrative
          />
          <StatCard
            label="Median risk score"
            value="37"
            helper="Across analysed claims"
            icon={<ShieldIcon width={16} height={16} />}
            illustrative
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardHeading
              title="Risk distribution"
              description="Share of analysed claims by prioritisation level."
              icon={<ShieldIcon width={16} height={16} />}
            />
            <span className="rounded bg-ink-100 px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-ink-500">
              Illustrative
            </span>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {RISK_DISTRIBUTION.map((row) => (
                <li key={row.level}>
                  <div className="flex items-center justify-between gap-4">
                    <RiskBadge level={row.level} />
                    <span className="text-sm font-medium text-navy-800">
                      {row.share}%
                    </span>
                  </div>
                  <div
                    className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink-100"
                    role="img"
                    aria-label={`${row.level} risk: ${row.share} percent`}
                  >
                    <div
                      className={`h-full rounded-full ${barTone[row.level]}`}
                      style={{ width: `${row.share}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardHeading
              title="Recent activity"
              description="Latest analysed claims."
              icon={<HistoryIcon width={16} height={16} />}
            />
          </CardHeader>
          <CardContent className="px-0 py-0">
            <StatePanel
              title="No activity yet"
              description="Recent claims will appear here once the API connection is enabled in a later step."
            />
          </CardContent>
        </Card>
      </div>

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
    </>
  )
}
