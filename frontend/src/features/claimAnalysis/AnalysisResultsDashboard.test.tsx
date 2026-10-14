import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AnalysisResultsDashboard } from './AnalysisResultsDashboard'
import type { ClaimAnalysisResponse } from '../../api/claims'

const baseResponse: ClaimAnalysisResponse = {
  claim_id: 'POLICY-42',
  fraud: { probability: 0.375 },
  severity: { predicted_claim_amount: 11076.093 },
  anomaly: { score: -0.04734 },
  risk: { score: 31.164, level: 'MEDIUM' },
  explanation: {
    fraud: { probability: 0.375 },
    anomaly: { score: -0.04734 },
    severity: { predicted_amount: 11076.093 },
    risk: {
      score: 31.164,
      level: 'MEDIUM',
      components: { fraud: 37.5, anomaly: -4.734, severity: 54.39 },
      summary:
        'Risk score combines fraud, anomaly, and severity signals for prioritization.',
    },
  },
  decision: {
    recommendation: 'ENHANCED_REVIEW',
    priority: 'MEDIUM',
    risk_score: 31.164,
    risk_level: 'MEDIUM',
    reasons: ['Overall risk score is 31.2 (MEDIUM).'],
    suggested_actions: [
      'Perform additional claim verification.',
      'Review supporting documentation.',
    ],
    triggered_rules: [],
    policy_version: '1.0',
    human_decision_required: true,
  },
  analysis_id: 'AN-1',
  persisted: true,
}

const emptyResponse: ClaimAnalysisResponse = {
  claim_id: null,
  fraud: {},
  severity: {},
  anomaly: {},
  risk: {},
  explanation: {},
  decision: {},
  analysis_id: null,
  persisted: false,
}

function renderDashboard(response = baseResponse, onStartAnother = () => {}) {
  return render(
    <AnalysisResultsDashboard
      response={response}
      onStartAnother={onStartAnother}
    />,
  )
}

describe('AnalysisResultsDashboard', () => {
  it('renders the header, claim id and risk level', () => {
    renderDashboard()
    expect(screen.getByText('Claim Analysis')).toBeDefined()
    expect(screen.getByText('Claim ID: POLICY-42')).toBeDefined()
    // Risk level is communicated by text, not colour alone.
    expect(screen.getAllByText(/MEDIUM/).length).toBeGreaterThan(0)
  })

  it('renders unchanged with the preserved persistence metadata', () => {
    // The dashboard does not act on analysis_id/persisted yet; these fields must
    // not alter the existing rendering or fabricate persistence messaging.
    renderDashboard({
      ...baseResponse,
      analysis_id: 'AN-123',
      persisted: false,
    })
    expect(screen.getByText('Claim Analysis')).toBeDefined()
    // The honest "in memory only" disclaimer is still shown.
    expect(
      screen.getByText(/does not confirm that the claim was saved/i),
    ).toBeDefined()
  })

  it('renders each real metric', () => {
    renderDashboard()
    expect(screen.getAllByText(/Fraud probability/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Predicted claim amount/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Anomaly score/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Overall risk score/).length).toBeGreaterThan(0)

    expect(screen.getAllByText('37.5%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$11,076.09').length).toBeGreaterThan(0)
    expect(screen.getAllByText('-0.047').length).toBeGreaterThan(0)
    expect(screen.getAllByText('31.2').length).toBeGreaterThan(0)
  })

  it('distinguishes the fraud probability from the overall risk score', () => {
    renderDashboard()
    // The risk score is never labelled as a fraud probability.
    expect(
      screen.getByText(/Not a fraud probability/i),
    ).toBeDefined()
    expect(screen.getByText(/Model-estimated likelihood/i)).toBeDefined()
    // Risk score is explicitly on a 0-100 scale.
    expect(screen.getByText(/0–100 prioritization score/i)).toBeDefined()
  })

  it('formats currency and percentages correctly', () => {
    renderDashboard()
    expect(screen.getAllByText('$11,076.09').length).toBeGreaterThan(0)
    expect(screen.getAllByText('37.5%').length).toBeGreaterThan(0)
    // Never shows raw floating point artefacts.
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/11076\.09/)
    expect(text).not.toMatch(/NaN|Infinity|undefined/)
  })

  it('shows the risk components returned by the model', () => {
    renderDashboard()
    expect(screen.getByText('37.5 of 100')).toBeDefined()
    expect(screen.getByText('54.4 percentile')).toBeDefined()
    // Anomaly is unbounded and is described, not placed on a 0-100 bar.
    expect(screen.getByText(/Unbounded isolation score/i)).toBeDefined()
  })

  it('shows the explanation data and summary', () => {
    renderDashboard()
    expect(screen.getByText(/Risk score combines fraud/)).toBeDefined()
    expect(
      screen.getByText(/No feature-level contributions or rule-based reasons/i),
    ).toBeDefined()
  })

  it('shows an honest empty state when explanation data is missing', () => {
    renderDashboard({ ...emptyResponse, explanation: { risk: {} } })
    expect(
      screen.getByText(/No explanation data was returned/i),
    ).toBeDefined()
  })

  it('shows the decision recommendation and suggested actions', () => {
    renderDashboard()
    expect(screen.getAllByText('ENHANCED_REVIEW').length).toBeGreaterThan(0)
    expect(
      screen.getByText('Perform additional claim verification.'),
    ).toBeDefined()
    expect(screen.getByText('Overall risk score is 31.2 (MEDIUM).')).toBeDefined()
    expect(screen.getByText('1.0')).toBeDefined()
  })

  it('shows the human-review notice and start-another action', () => {
    let clicked = false
    renderDashboard(baseResponse, () => {
      clicked = true
    })
    expect(screen.getByText(/Decision support only/i)).toBeDefined()
    expect(
      screen.getAllByText(/assists a human reviewer/i).length,
    ).toBeGreaterThan(0)
    fireEvent.click(
      screen.getByRole('button', { name: /start another analysis/i }),
    )
    expect(clicked).toBe(true)
  })

  it('handles missing or nullable fields with honest empty states', () => {
    renderDashboard(emptyResponse)
    expect(screen.getAllByText('Not returned').length).toBeGreaterThan(0)
    expect(screen.getByText('Claim ID not returned')).toBeDefined()
    expect(screen.getByText('No reasons returned.')).toBeDefined()
    expect(screen.getByText('No suggested actions returned.')).toBeDefined()
    expect(screen.getByText(/No explanation data was returned/i)).toBeDefined()
  })

  it('does not fabricate scores and never declares a claim fraudulent', () => {
    const malformed: ClaimAnalysisResponse = {
      claim_id: 'P1',
      fraud: { probability: null as unknown as number },
      severity: { predicted_claim_amount: undefined as unknown as number },
      anomaly: { score: NaN as unknown as number },
      risk: { score: 'x' as unknown as number, level: '' },
      explanation: {},
      decision: { human_decision_required: false },
      analysis_id: null,
      persisted: false,
    }
    renderDashboard(malformed)
    expect(screen.getAllByText('Not returned').length).toBeGreaterThan(0)
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/is fraudulent/i)
    expect(text).not.toMatch(/guaranteed payout/i)
    expect(text).not.toMatch(/NaN|Infinity|undefined/)
  })

  it('does not rely on colour alone for the risk level', () => {
    renderDashboard()
    // The level text is present in the accessible tree.
    const levelMatches = screen.getAllByText(/MEDIUM/)
    expect(levelMatches.length).toBeGreaterThan(0)
  })
})
