# ClaimPilot AI — Explainable AI (Module 8)

## 1. Purpose
Provide clear, human-readable explanations for fraud/severity/anomaly predictions and the combined risk score.

## 2. Approach
- Risk: deterministic component breakdown (no SHAP needed)
- Fraud/Severity: model-specific feature contribution structure prepared
- Anomaly: descriptive reasons (unsupervised)
- Avoids causal claims and automatic decisions

## 3. Example
Risk score 84 (CRITICAL): fraud contributes ~39, anomaly ~23, severity ~23 points (by weights). Summary explains prioritization.

## 4. Artifacts
- `src/claimpilot/risk/explainer.py` (unified explanation contract)
- `tests/test_explainability.py`

## 5. Limitations
Explanations describe model behavior; synthetic dataset; severity model weak signal.

## Conclusion
Module 8 complete. Ready for Module 9.
