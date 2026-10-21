# ClaimPilot AI — Dataset Documentation (Module 1)

## 1. Dataset Selected

- **Name:** Car Insurance Fraud Detection Dataset
- **Source:** Kaggle ([ahluwaliasaksham/car-insurance-fraud-detection-dataset](https://www.kaggle.com/datasets/ahluwaliasaksham/car-insurance-fraud-detection-dataset))
- **Acquisition:** Downloaded via `kagglehub` and saved to `data/raw/insurance_fraud_car.csv`
- **Rows:** 30,000
- **Columns:** 24
- **File:** `data/raw/insurance_fraud_car.csv`
- **License/Usage:** Stated as synthetic dataset for educational/research/ML benchmarking purposes (no real customer/claim data)
- **Status:** Stored raw (unmodified)

## 2. What One Row Represents

Each row represents **one insurance claim** submitted for a vehicle insurance policy. The row captures policy details, insured demographics, incident characteristics, claim amounts, and whether the claim was reported as fraudulent.

## 3. Fraud Target (Supervised Classification)

- **Target Column:** `fraud_reported`
- **Type:** Categorical (string) - values `Y` and `N`
- **Meaning:** Indicates whether the claim was reported as fraudulent (`Y`) or legitimate (`N`)
- **Positive Class (Fraud):** `Y`
- **Negative Class (Legitimate):** `N`
- **Distribution:**
  - `N` (Legitimate): 26,560 (88.53%)
  - `Y` (Fraud): 3,440 (11.47%)
- **Class Imbalance:** Yes, fraud is the minority class (~11.5%). This will need to be considered in evaluation (PR-AUC, precision/recall, threshold tuning) in later modules.

**Note:** Target is binary; for modeling, we will encode to `0/1` (N→0, Y→1). The label is provided as-is in this dataset.

## 4. Severity Target (Claim Amount)

- **Severity/Amount Column:** `claim_amount` (USD)
- **Type:** Numeric (float)
- **Meaning:** Amount claimed by the insured (as stated in the dataset). Also `total_claim_amount` is present (total settlement/total claim-related amount in the dataset).
- **Candidate Regression Target:** `claim_amount` (primary claim amount figure). We should verify semantics vs `total_claim_amount` during modeling - but for Module 1, we identify both.
- **Units:** USD (implied)
- **Inference-time Availability:** Claim amount is typically known at claim submission time - so it can be a feature in some contexts, but if predicting "expected claim amount" we must be careful about leakage depending on formulation. We treat `claim_amount` as a target candidate for claim severity/amount prediction.

## 5. Column Overview

All columns (24):

| Column | Type | Description |
|---|---|---|
| `policy_id` | object | Unique policy identifier |
| `policy_state` | object | State where policy was issued (GA, PA, etc.) |
| `policy_deductible` | int | Policy deductible amount |
| `policy_annual_premium` | float | Annual premium paid |
| `insured_age` | int | Age of insured |
| `insured_sex` | object | Sex of insured (MALE/FEMALE/OTHER) |
| `insured_education_level` | object | Education level |
| `insured_occupation` | object | Occupation |
| `insured_hobbies` | object | Hobbies |
| `incident_date` | object | Date of incident (YYYY-MM-DD) |
| `incident_type` | object | Type of incident (Parked Car, Vehicle Theft, etc.) |
| `collision_type` | object | Collision type (Front/Rear/etc.) |
| `incident_severity` | object | Severity of incident |
| `authorities_contacted` | object | Authorities contacted (Police, Fire, etc.) - has NaN |
| `incident_state` | object | State where incident occurred |
| `incident_city` | object | City where incident occurred |
| `incident_hour_of_the_day` | int | Hour of day when incident occurred (0-23) |
| `number_of_vehicles_involved` | int | Number of vehicles involved |
| `bodily_injuries` | int | Number of bodily injuries |
| `witnesses` | int | Number of witnesses |
| `police_report_available` | object | Police report available (Yes/No) - has NaN |
| `claim_amount` | float | Claimed amount |
| `total_claim_amount` | float | Total claim amount |
| `fraud_reported` | object | Target (Y/N) |

## 6. Feature Classification

### Identifiers (exclude as ML features)
- `policy_id` — Policy identifier; not a predictive feature

### Targets
- `fraud_reported` — Fraud classification target (Y/N)
- `claim_amount` / `total_claim_amount` — Severity/amount targets (regression candidates)

### Candidate Features (likely available at claim submission time)
- Policy: `policy_state`, `policy_deductible`, `policy_annual_premium`
- Insured: `insured_age`, `insured_sex`, `insured_education_level`, `insured_occupation`, `insured_hobbies` (may be available depending on context)
- Incident (context at submission): `incident_type`, `collision_type`, `incident_severity`, `incident_state`, `incident_city`, `incident_hour_of_the_day`, `number_of_vehicles_involved`, `bodily_injuries`, `witnesses`, `authorities_contacted`, `police_report_available`, `incident_date`

### Post-claim / Potential Leakage Considerations
- `total_claim_amount` — Often relates to settlement/final amounts; needs careful handling to avoid leakage if using as input. If predicting expected claim amount, `claim_amount` is the claimed amount (submission-time). `total_claim_amount` semantics should be confirmed in modeling.
- Any field that only becomes known after investigation/settlement should not be used as inference feature. Most fields above appear to be claim submission context.

### Unknown/Needs Clarification
- `authorities_contacted` — contains NaN values (needs handling in Module 3)
- `police_report_available` — contains NaN values (needs handling in Module 3)
- Exact definition difference between `claim_amount` and `total_claim_amount` — document once clarified via EDA (Module 2)

## 7. Leakage Risks

- **High risk if misused:** `total_claim_amount` could leak information if treated as input to predict fraud in certain formulations; must be evaluated against "available at submission" rule.
- **IDs:** `policy_id` should not be used as feature.
- **Target-derived fields:** None obvious; targets are clearly labeled.
- **Temporal/Post-settlement:** Avoid using post-investigation outcomes. All core features appear to be pre/post-incident context available at submission.

## 8. Data Quality (Basic Assessment)

- **Rows:** 30,000 | **Columns:** 24
- **Missing Values:** 
  - `authorities_contacted`: has NaN
  - `police_report_available`: has NaN
- **Duplicates:** None obvious from inspection; to be confirmed in Module 2 if needed
- **Data Types:** Mix of int/float/object; dates stored as strings
- **Categoricals:** policy_state, insured_sex, insured_education_level, insured_occupation, insured_hobbies, incident_type, collision_type, incident_severity, authorities_contacted, incident_state, incident_city, police_report_available, fraud_reported
- **Numerics:** policy_deductible, policy_annual_premium, insured_age, incident_hour_of_the_day, number_of_vehicles_involved, bodily_injuries, witnesses, claim_amount, total_claim_amount
- **Dates:** incident_date (string format)

## 9. ML Feasibility

| Component | Status | Rationale |
|---|---|---|
| **Fraud Detection (Supervised)** | **YES** | Reliable binary target `fraud_reported` (Y/N) with 30k samples and meaningful features. Imbalance exists (~11.5%) but manageable. |
| **Claim Severity/Amount Prediction (Regression)** | **YES** | `claim_amount` (and/or `total_claim_amount`) available as numeric targets. Sufficient features to model expected claim amount. |
| **Anomaly Detection (Unsupervised)** | **YES** | Rich feature set (demographics, policy, incident details) enables outlier/anomaly detection even beyond labeled fraud. Can complement supervised model. |
| **Risk Scoring Engine** | **YES** | Combines fraud probability, expected amount deviation, anomaly score, and business rules into unified risk score - dataset supports all required signals. |

## 10. Dataset Limitations

- **Labeling:** `fraud_reported` is the provided label; we treat as ground truth for this exercise. In production, "reported as fraudulent" vs "confirmed fraud" differ - but dataset gives explicit label suitable for ML training.
- **Missing values:** `authorities_contacted` and `police_report_available` have NaNs - need imputation/encoding strategy.
- **Synthetic nature:** Dataset is synthetic (per Kaggle description) - good for learning/portfolio, but may not capture all real-world fraud patterns.
- **Temporal coverage:** Only `incident_date` present; no explicit claim submission/reporting dates beyond incident context - time-based splitting still possible using incident_date.
- **Currency/semantics:** `claim_amount` vs `total_claim_amount` distinction needs clarification during EDA; both present.
- **Class imbalance:** ~11.5% fraud rate - requires appropriate metrics and handling strategies.
- **Limited post-claim outcomes:** Few explicit investigation outcomes beyond the binary fraud flag.

## 11. Files Created/Modified (Module 1)

**Created:**
- `docs/dataset.md` — Comprehensive dataset documentation (data dictionary, targets, feature classification, leakage risks, feasibility, limitations)

**Modified:**
- `README.md` — Updated module status: Module 0 Complete, Module 1 Complete
- `data/raw/insurance_fraud_car.csv` — Downloaded dataset stored raw (unmodified)

## 12. Git Status

```text
## main...origin/main
 M README.md
?? data/raw/insurance_fraud_car.csv
?? docs/
```

Note: `data/raw/*.csv` is gitignored by existing `.gitignore` (`data/raw/` entry). The file is present locally but will not be tracked by Git - this is correct per project policy (raw data not committed). `docs/` is new and untracked (documentation is fine to track).

## Summary

Module 1 complete. Dataset selected and understood: Car Insurance Fraud Detection (30k rows, 24 cols), with `fraud_reported` as supervised target (Y/N, 11.5% fraud) and `claim_amount` as severity target. Feature classification done, leakage risks identified, ML feasibility confirmed for all four components (fraud classification, severity prediction, anomaly detection, risk scoring). Documentation created in `docs/dataset.md`. Ready for Module 2 (EDA).
