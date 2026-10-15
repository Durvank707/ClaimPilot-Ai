import pandas as pd


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    # simple date features if incident_date exists
    if "incident_date" in df.columns:
        try:
            dt = pd.to_datetime(df["incident_date"], errors="coerce")
            df["incident_month"] = dt.dt.month
            df["incident_day_of_week"] = dt.dt.dayofweek
            df["incident_year"] = dt.dt.year
        except Exception:
            pass
    # binary police report
    if "police_report_available" in df.columns:
        df["police_report_available_bin"] = df["police_report_available"].map({"Yes": 1, "No": 0}).fillna(0)
    return df
