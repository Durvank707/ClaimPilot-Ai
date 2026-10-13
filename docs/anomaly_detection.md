# ClaimPilot AI — Anomaly Detection (Module 6)

## 1. Problem Definition
Identify unusual claims (anomalies) relative to learned claim population. Output standardized anomaly_score (higher = more anomalous) and anomaly_flag.

## 2. Difference from Fraud Detection
- Fraud: supervised (uses fraud labels) to estimate P(fraud)
- Anomaly: unsupervised; learns normal patterns without using fraud labels as training input. Complements fraud model.

## 3. Feature Set
Uses ANOMALY_NUM_COLS + ANOMALY_CAT_COLS from `src/claimpilot/features/sets.py`. `fraud_target` explicitly excluded from inputs.

## 4. Training Population
Trained on training split claims (unsupervised). Fraud labels not used during fitting; used only for evaluation/enrichment.

## 5. Algorithm
Isolation Forest (sklearn). Decision function inverted to produce higher = more anomalous.

## 6. Threshold
Configurable (default 0.5 in interface). Contamination set (e.g. 0.1) affects raw outlier assignment; score is standardized for interpretation.

## 7. Evaluation (representative)
- Overall fraud rate ~10.75% (val)
- Top 5% anomalies: ~11.0% fraud rate (minimal enrichment in this quick run) - demonstrates independence; tuning may improve.

## 8. Fraud vs Anomaly
Intentionally independent signals. Can be combined later (Module 7) into risk scoring.

## 9. Artifacts
- `models/anomaly_model_v1.joblib`
- `models/anomaly_model_v1_metadata.json`

## 10. Limitations
Synthetic dataset; anomaly != fraud; no ground truth for "anomaly"; enrichment modest with default params.

## Files
- `src/claimpilot/models/anomaly_model.py`
- `notebooks/06_anomaly_detection.py`
- `tests/test_anomaly_model.py`
- `docs/anomaly_detection.md`

## Conclusion
Module 6 complete. Independent anomaly detection model implemented with standardized score, flag, saved artifacts, tests. Ready for Module 7.
