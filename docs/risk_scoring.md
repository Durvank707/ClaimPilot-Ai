# ClaimPilot AI — Risk Scoring (Module 7)

## 1. Purpose
Combine fraud probability, expected claim amount, and anomaly score into unified prioritization score (0-100) with risk levels. Risk score is prioritization, not a fraud probability.

## 2. Inputs
- fraud_probability (0-1) from Module 4
- predicted_claim_amount (USD) from Module 5
- anomaly_score (higher=more anomalous, standardized) from Module 6

## 3. Normalization
- Fraud: scaled to 0-100 (fraud_prob*100)
- Anomaly: scaled to 0-100 (anomaly_score*100)
- Severity: percentile-based against reference distribution (training reference) mapped to 0-100

## 4. Weights (Configurable)
Default: fraud 0.50, anomaly 0.25, severity 0.25 (sum 1.0). Config in `configs/risk_scoring.json`.

## 5. Formula
Risk Score = 100 * (w_fraud*fraud_prob + w_anom*anom_score + w_sev*sev_pctile)

Clipped to 0-100.

## 6. Risk Levels
LOW 0-29, MEDIUM 30-59, HIGH 60-79, CRITICAL 80-100

## 7. Sensitivity & Analysis
On sample: LOW 94.3% claims (10.07% fraud), MEDIUM ~5.7% (14.04% fraud) — shows moderate enrichment at higher tiers. Weights/policy configurable.

## 8. Artifacts
- `configs/risk_scoring.json` (policy v1)
- `src/claimpilot/risk/scorer.py` (scoring engine)

## 9. Limitations
Weights are policy choices; risk score is prioritization (not probability). Synthetic dataset; severity model signal limited.

## 10. Conclusion
Module 7 complete. Transparent, configurable risk scoring combining three independent signals. Ready for Module 8.
