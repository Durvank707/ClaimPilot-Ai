from typing import Dict, List
import pandas as pd

REQUIRED_COLUMNS = [
    "policy_id",
    "fraud_reported",
    "claim_amount",
    "incident_date",
]


def validate_required_columns(df: pd.DataFrame) -> None:
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")


def validate_target_values(df: pd.DataFrame) -> None:
    allowed = {"Y", "N"}
    bad = set(df["fraud_reported"].dropna().unique()) - allowed
    if bad:
        raise ValueError(f"Unexpected fraud_reported values: {bad}")


def validate_numerical_ranges(df: pd.DataFrame) -> None:
    if (df["claim_amount"] < 0).any():
        raise ValueError("Negative claim_amount found")


def validate_dataset(df: pd.DataFrame) -> None:
    validate_required_columns(df)
    validate_target_values(df)
    validate_numerical_ranges(df)
