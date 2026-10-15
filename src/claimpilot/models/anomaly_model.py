import json
from pathlib import Path
from typing import Any, Dict
import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import IsolationForest


class AnomalyModel:
    def __init__(self, random_state: int = 42, contamination: float = 0.1):
        self.random_state = random_state
        self.contamination = contamination
        self.pipeline = None

    def build_pipeline(self):
        cat_cols = [
            "policy_state",
            "insured_sex",
            "insured_education_level",
            "incident_type",
            "incident_severity",
            "authorities_contacted",
            "incident_state",
        ]
        num_cols = [
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
        preproc = ColumnTransformer(
            transformers=[
                ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), cat_cols),
                ("num", "passthrough", num_cols),
            ]
        )
        clf = IsolationForest(random_state=self.random_state, contamination=self.contamination, n_jobs=-1)
        self.pipeline = Pipeline([("pre", preproc), ("clf", clf)])
        return self.pipeline

    def fit(self, X: pd.DataFrame) -> "AnomalyModel":
        self.build_pipeline()
        self.pipeline.fit(X)
        return self

    def score(self, X: pd.DataFrame) -> np.ndarray:
        # return higher = more anomalous (sklearn gives -1 for anomaly; convert)
        raw = self.pipeline.decision_function(X)
        # decision_function: higher is inlier; lower is outlier -> invert
        scores = -raw
        return scores

    def predict_flag(self, X: pd.DataFrame, threshold: float = 0.5) -> np.ndarray:
        scores = self.score(X)
        return (scores >= threshold).astype(int)

    def save(self, model_path: Path, metadata_path: Path = None):
        model_path = Path(model_path)
        model_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, model_path)
        if metadata_path is not None:
            meta = {"contamination": self.contamination, "random_state": self.random_state}
            with open(metadata_path, "w") as f:
                json.dump(meta, f, indent=2)

    @staticmethod
    def load(model_path: Path) -> "AnomalyModel":
        return joblib.load(Path(model_path))
