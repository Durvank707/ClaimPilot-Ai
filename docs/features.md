# ClaimPilot AI — Feature Engineering Summary (Module 3)

## 1. Cleaning Decisions
- Raw data left untouched in `data/raw/`.
- Dropped exact duplicate rows (none observed; pipeline handles generically).
- `authorities_contacted` NaN → "Unknown"
- `police_report_available` NaN → "Unknown" (though none observed)

## 2. Missing Value Strategy
- Categorical missingness represented explicitly as "Unknown" to preserve signal.
- Numerical columns had no NaNs in inspected fields.

## 3. Duplicate Strategy
- Remove exact duplicates; document count (original vs processed). Traceability preserved via `policy_id`.

## 4. Target Transformations
- `fraud_reported` (Y/N) → `fraud_target` (1/0)

## 5. Engineered Features
- `incident_month`, `incident_day_of_week`, `incident_year` from `incident_date`
- `police_report_available_bin` (1/0) from `police_report_available`

## 6. Excluded Features (Not used as predictive inputs)
- Identifiers: `policy_id` (metadata only)
- Targets/leakage candidates: `fraud_reported`, `total_claim_amount` (semantics caution; excluded from modeling matrices)
- Post-claim/settlement-like fields avoided in severity inputs per task split

## 7. Task-Specific Feature Sets (Leakage-Aware)
### Fraud Detection (Target: `fraud_target`)
Numerical: policy_deductible, policy_annual_premium, insured_age, incident_hour_of_the_day, number_of_vehicles_involved, bodily_injuries, witnesses, claim_amount, incident_month, incident_day_of_week, police_report_available_bin
Categorical: policy_state, insured_sex, insured_education_level, insured_occupation, incident_type, collision_type, incident_severity, authorities_contacted, incident_state, incident_city

### Claim Severity (Target: `claim_amount`) 
Excludes `claim_amount` and `total_claim_amount` from inputs.
Numerical: same as above but without `claim_amount`
Categorical: same categorical set

### Anomaly Detection (Unsupervised; no target label used as input)
Same as severity feature set (no fraud_target/claim_amount as inputs). Uses behavioral/incident/policy features.

## 8. Leakage Controls
- `fraud_target` never used as input
- `claim_amount` excluded from severity features
- `total_claim_amount` excluded from modeling matrices (potential redundancy/leakage)
- IDs kept as metadata only
- Post-claim fields not introduced

## 9. Processed Data
- `data/processed/processed_all.csv` (cleaned + engineered, includes targets + metadata)

## 10. Known Limitations
- Synthetic dataset; generalization to real-world not assumed
- `authorities_contacted` missing represented as "Unknown" (25% original)
- Severity model must not use claimed amount as feature (by design)

## Files Created/Modified
- Created: `src/claimpilot/data/validators.py`, `src/claimpilot/data/preprocessor.py`, `src/claimpilot/features/engineer.py`, `src/claimpilot/features/sets.py`, `notebooks/03_feature_engineering.py`, `docs/features.md`
- Modified: README.md (Module 3 marked Complete)
- Generated: `data/processed/processed_all.csv`

## Conclusion
Module 3 complete. Clean, leakage-safe, task-specific feature sets defined and processed data saved. Ready for Module 4 (Fraud Detection) when instructed.
