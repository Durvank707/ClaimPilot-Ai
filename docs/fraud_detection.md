# ClaimPilot AI — Fraud Detection (Module 4)

## 1. Problem Definition
Predict P(claim is fraudulent | info at claim submission). Return probability; threshold tunable. Goal: detect suspicious claims while managing false positives.

## 2. Dataset
- Source: processed_all.csv (Module 3)
- Rows: 30,000
- Target: fraud_target (1=fraud, 0=legit), ~11.47% fraud

## 3. Feature Set
Uses FRAUD_NUM_COLS + FRAUD_CAT_COLS from `src/claimpilot/features/sets.py`. Includes claim_amount (allowed at submission per design). Excludes IDs, total_claim_amount, post-claim fields.

## 4. Data Split
- Method: stratified train/val/test (preserve fraud ratio)
- Proportions: ~72.25% train (21675), ~12.75% val (3825), ~15% test (4500) in this run
- Random seed: 42
- Stratified on y
- Test set untouched for final evaluation

## 5. Baseline
Majority class (predict legit) gives ~88.5% accuracy but 0 precision/recall for fraud - confirms metrics must be precision/recall/PR-AUC.

## 6. Models
- Logistic Regression (baseline interpretable)
- Random Forest (class_weight balanced)
- XGBoost (scale_pos_weight balanced)

## 7. Class Imbalance
Addressed via class weights/scale_pos_weight computed from training data. No resampling applied in this baseline run.

## 8. Evaluation Metrics
Primary: Precision, Recall, F1, ROC-AUC, PR-AUC. Also confusion matrix, false pos/neg rates.

## 9. Results (representative)
Example run (RF on 8000 train samples): 
- Val: Precision 0.265, Recall 0.412, F1 0.322, ROC-AUC 0.707, PR-AUC 0.232
- Test: Precision 0.281, Recall 0.422, F1 0.337, ROC-AUC 0.713, PR-AUC 0.259

Trade-off: flagging ~23% of claims yields ~42% recall at ~28% precision (threshold 0.3). Business must choose threshold.

## 10. Threshold
Selected 0.3 for demonstration (validation-based). Final threshold should be chosen per business tolerance (investigation workload vs fraud detection).

## 11. Final Artifact
- Model: `models/fraud_model_v1.joblib`
- Metadata: `models/fraud_model_v1_metadata.json`

## 12. Limitations
Synthetic dataset; calibration not tuned; limited hyperparameter tuning. Results demonstrate methodology, not production readiness.

## Files
- `src/claimpilot/models/fraud_model.py` (pipeline, predict, evaluate, save/load)
- `notebooks/04_fraud_detection.py` (experiment)
- `tests/test_fraud_model.py` (inference test)
- `docs/fraud_detection.md` (this doc)
- `models/fraud_model_v1.*` (artifacts)
- `scripts/run_fraud_eval.py` (utility)

## Conclusion
Module 4 complete. Fraud probability model implemented with proper train/val/test split, metrics, threshold analysis approach, saved artifacts, and tests. Ready for Module 5.
