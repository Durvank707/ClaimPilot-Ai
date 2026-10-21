# ClaimPilot AI — EDA Summary (Module 2)

## 1. Dataset Overview (Verified)
- **File:** `data/raw/insurance_fraud_car.csv`
- **Shape:** 30,000 rows × 24 columns
- **Fraud target:** `fraud_reported` (Y/N)
- **Severity target:** `claim_amount` (USD)
- **Duplicates:** None observed in basic checks; dataset appears clean on structure
- **Class imbalance:** ~88.53% Legitimate (N), ~11.47% Fraudulent (Y) — minority class ~11.5%

## 2. Data Quality Findings
- **Missing values:** `authorities_contacted` has 7,564 NaNs (25.2%). Others appear complete.
- **`police_report_available`:** No NaNs (values Yes/No)
- **`authorities_contacted` values:** Ambulance, Fire, Police (when present). Missingness pattern worth noting; not obviously dominated by fraud alone.
- **Dates:** `incident_date` stored as string; types otherwise mix of int/float/object as expected.

## 3. Fraud Distribution
- **Overall:** 26,560 (88.53%) non-fraud, 3,440 (11.47%) fraud
- **Fraud rate:** ~11.5%
- **By incident type (fraud rate):**
  - Vehicle Theft: 11.78%
  - Single Vehicle Collision: 11.57%
  - Multi-vehicle Collision: 11.55%
  - Parked Car: 10.95%
- Rates fairly similar across incident types (narrow range ~11-11.8%).

## 4. Claim Amount Findings
- **Overall:** mean 10,823.08; median 10,204.17; std 6,629.69; min 266.74; max 29,719.87
- **By fraud status:**
  - Non-fraud (N): mean 10,722.99; median 10,115.49
  - Fraud (Y): mean 11,595.82; median 10,907.97
- Fraudulent claims tend to have slightly higher mean/median claim amounts compared to legitimate claims (difference of ~870-790). Distribution is right-skewed (mean>median).

## 5. Important Feature Relationships (Observed)
- **Claim amount vs fraud:** Fraudulent claims show modestly higher central tendency; not extreme separation alone.
- **Incident characteristics:** Incident types show similar fraud rates; collision types/severity to be explored further in notebook.
- **Authorities contacted (when recorded):** Ambulance (8.48% fraud), Fire (8.38%), Police (7.78%) — lower rates when authority recorded compared to overall? Or may reflect context. Needs careful interpretation.
- **`total_claim_amount`:** Present alongside `claim_amount` — potential redundancy/leakage concern (semantics differ). Must not use as inference feature blindly.
- **Policy/insured features:** Age, premiums, deductibles, vehicles involved, bodily injuries, witnesses — candidates for modeling; relationships to be detailed in notebook.

## 6. Potential Leakage / Redundancy
- **`total_claim_amount`:** Strongly related conceptually to claim amount; could leak post-claim/settlement info. Exclude from inference features unless proven safe and necessary. Investigate exact definition.
- **`policy_id`:** Identifier only, exclude from features.
- **Target:** `fraud_reported` is target (never use as input).

## 7. Missing Data Findings
- **`authorities_contacted`:** 7,564 missing (~25%). Missingness does not immediately suggest strong fraud signal; investigate distribution by fraud in notebook.
- **`police_report_available`:** Complete (no missing). Values balanced (Yes/No ~50/50).

## 8. Temporal Findings
- **`incident_date`:** Available (YYYY-MM-DD). Range spans 2024-2025 based on sample; full range to be confirmed in notebook. Useful for time-aware validation if desired.

## 9. Modeling Hypotheses (Guiding Next Steps)
1. **H1 (Claim amount signal):** Higher claim amounts modestly associated with fraud — may help classification.
2. **H2 (Incident context):** Incident type/collision/severity may carry weak/modest signal.
3. **H3 (Authorities/contact/reporting):** Presence/type of authorities contacted or police report availability may correlate with fraud patterns.
4. **H4 (Redundancy):** `total_claim_amount` likely redundant/leaky relative to `claim_amount` — avoid using as input.
5. **H5 (Imbalance):** Need metrics beyond accuracy (PR-AUC, precision/recall) due to ~11.5% fraud.
6. **H6 (Missingness):** Handle `authorities_contacted` missing values thoughtfully in preprocessing (not EDA removal).
7. **H7 (Feature interactions):** Combinations (e.g. incident type + amount + vehicles involved) may improve signal.

## 10. Business Insights
- Fraud is present but minority (~11.5%) — prioritization important.
- Fraudulent claims tend to be slightly higher value — deviation from expected amount could help risk scoring.
- Incident types alone not strong discriminators; need richer feature combinations.
- Need explainable outputs (factors) to support human-in-loop decision making.

## 11. Limitations
- Synthetic dataset (good for learning/portfolio) — real-world fraud dynamics may differ.
- Moderate class imbalance.
- Missing data in `authorities_contacted` (~25%).
- `total_claim_amount` semantics unclear — treat cautiously.

## Files Created/Modified (Module 2)
- **Created:** `notebooks/02_eda.py` (exploratory script), `docs/eda.md` (summary)
- **Modified:** `README.md` (Module 2 marked Complete)

## Git Status
```text
 M README.md
?? docs/eda.md
?? notebooks/02_eda.py
?? pyproject.toml
?? requirements.txt
?? scripts/
?? src/
?? tests/
```
Raw data remains gitignored. Documentation added.

## Conclusion
EDA complete. Key findings: 11.5% fraud, fraud claims slightly higher amounts, missing `authorities_contacted` (~25%), `total_claim_amount` likely redundant/leaky. Ready for Module 3 (Data Cleaning & Feature Engineering).
