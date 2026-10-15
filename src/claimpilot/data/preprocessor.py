import pandas as pd
from typing import Dict, Tuple

class DataCleaner:
    def __init__(self, df: pd.DataFrame):
        self.df = df.copy()

    def clean(self) -> pd.DataFrame:
        # remove exact duplicates
        before = len(self.df)
        self.df = self.df.drop_duplicates().reset_index(drop=True)
        # handle missing authorities_contacted
        if "authorities_contacted" in self.df.columns:
            self.df["authorities_contacted"] = self.df["authorities_contacted"].fillna("Unknown")
        if "police_report_available" in self.df.columns:
            self.df["police_report_available"] = self.df["police_report_available"].fillna("Unknown")
        return self.df


def encode_targets(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    if "fraud_reported" in df.columns:
        df["fraud_target"] = df["fraud_reported"].map({"Y": 1, "N": 0}).astype(int)
    return df
