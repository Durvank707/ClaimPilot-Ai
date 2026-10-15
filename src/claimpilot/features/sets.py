# Task-specific feature sets (leakage-aware)
IDENTIFIER_COLS = ["policy_id"]

FRAUD_NUM_COLS = [
    "policy_deductible",
    "policy_annual_premium",
    "insured_age",
    "incident_hour_of_the_day",
    "number_of_vehicles_involved",
    "bodily_injuries",
    "witnesses",
    "claim_amount",
    "incident_month",
    "incident_day_of_week",
    "police_report_available_bin",
]

FRAUD_CAT_COLS = [
    "policy_state",
    "insured_sex",
    "insured_education_level",
    "insured_occupation",
    "incident_type",
    "collision_type",
    "incident_severity",
    "authorities_contacted",
    "incident_state",
    "incident_city",
]

SEVERITY_NUM_COLS = [
    "policy_deductible",
    "policy_annual_premium",
    "insured_age",
    "incident_hour_of_the_day",
    "number_of_vehicles_involved",
    "bodily_injuries",
    "witnesses",
    "incident_month",
    "incident_day_of_week",
    "police_report_available_bin",
]

SEVERITY_CAT_COLS = FRAUD_CAT_COLS

ANOMALY_NUM_COLS = SEVERITY_NUM_COLS
ANOMALY_CAT_COLS = FRAUD_CAT_COLS

TARGET_FRAUD = "fraud_target"
TARGET_SEVERITY = "claim_amount"
EXCLUDED = ["fraud_reported", "total_claim_amount"]
