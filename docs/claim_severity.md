# ClaimPilot AI — Claim Severity Prediction (Module 5)

## Problem Definition
Predict expected claim amount (USD) from info available at claim submission. Return numeric prediction.

## Target
- claim_amount (numeric, USD)
- Must NOT be in input features (leakage prevented)

## Feature Set
Severity set from `src/claimpilot/features/sets.py`: excludes claim_amount, total_claim_amount, fraud_target, policy_id. Includes policy/insured/incident features + engineered date/binary features.

## Baselines
- Mean (train): MAE ~5537, RMSE ~6663, R2 near 0
- Median (train-derived): MAE ~5516, RMSE ~6686, R2 negative small
Baselines set floor.

## Models
- Linear Regression (slim encoding to avoid memory issues)
- Random Forest (smaller n_estimators for efficiency)
- XGBoost (optional future; not trained here due to memory/time constraints in this environment)

## Results (Linear, full train)
Val: MAE ~5537, RMSE ~6663, R2 ~ -0.00013 (essentially no better than mean/median on this feature set). This suggests limited linear predictive signal with current features; nonlinear models may help but require tuning/resources.

## Leakage Check
Verified claim_amount not in X. Severity features exclude target/known leakage.

## Artifacts
- `models/severity_model_v1.joblib` (Linear slim pipeline)
- `models/severity_model_v1_metadata.json`

## Limitations
Synthetic dataset; current features show weak signal for amount prediction; linear model near baseline. Nonlinear tuning left for future iterations.

## Files
- `src/claimpilot/models/severity_model.py`, `src/claimpilot/models/severity_model_slim.py`
- `notebooks/05_claim_severity.py`
- `tests/test_severity_model.py`
- `docs/claim_severity.md`

## Conclusion
Module 5 complete. Baselines established, leakage-safe severity features used, linear severity model trained/saved, inference tests pass. Ready for Module 6.
