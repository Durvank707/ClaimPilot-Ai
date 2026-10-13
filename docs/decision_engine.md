# ClaimPilot AI — Decision Engine (Module 9)

## 1. Purpose
Convert ClaimPilot intelligence into transparent, deterministic, human-in-the-loop recommendations. Never auto-approve/reject/accuse.

## 2. Categories
ROUTINE_REVIEW, ENHANCED_REVIEW, URGENT_REVIEW, SPECIALIST_REVIEW

## 3. Rule Logic
Uses risk score as primary signal with escalation for elevated fraud+anomaly. Configurable via `configs/decision_policy.json`.

## 4. Example
Example claim (high risk+signals) -> SPECIALIST_REVIEW with reasons, suggested actions, triggered rules, policy_version, human_decision_required=True.

## 5. Limitations
Deterministic policy; weights/thresholds business assumptions.

## Conclusion
Module 9 complete. Ready for Module 10.
