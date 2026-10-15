import json
from pathlib import Path
from typing import Any, Dict, Tuple
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from xgboost import XGBClassifier
from sklearn.metrics import (
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    average_precision_score,
    confusion_matrix,
)


class FraudModel:
    def __init__(self, random_state: int = 42):
        self.random_state = random_state
        self.pipeline = None
        self.feature_names_in_ = None
        self.threshold = 0.5

    def build_pipeline(self, model_type: str = "xgboost", class_weight: str = "balanced"):
        cat_cols = [
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
        num_cols = [
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
        preproc = ColumnTransformer(
            transformers=[
                ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), cat_cols),
                ("num", "passthrough", num_cols),
            ]
        )
        if model_type == "logistic":
            clf = LogisticRegression(max_iter=1000, class_weight=class_weight, random_state=self.random_state)
        elif model_type == "rf":
            clf = RandomForestClassifier(n_estimators=200, class_weight=class_weight, random_state=self.random_state, n_jobs=-1)
        elif model_type == "xgboost":
            clf = XGBClassifier(n_estimators=300, max_depth=4, learning_rate=0.1, scale_pos_weight="balanced", random_state=self.random_state, n_jobs=-1)
        else:
            clf = XGBClassifier(n_estimators=200, max_depth=3, learning_rate=0.1, scale_pos_weight="balanced", random_state=self.random_state, n_jobs=-1)
        self.pipeline = Pipeline([("pre", preproc), ("clf", clf)])
        return self.pipeline

    def fit(self, X: pd.DataFrame, y: pd.Series, model_type: str = "xgboost") -> "FraudModel":
        self.build_pipeline(model_type=model_type)
        self.pipeline.fit(X, y)
        self.feature_names_in_ = X.columns.tolist()
        return self

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        return self.pipeline.predict_proba(X)[:, 1]

    def predict(self, X: pd.DataFrame, threshold: float = None) -> np.ndarray:
        th = self.threshold if threshold is None else threshold
        proba = self.predict_proba(X)
        return (proba >= th).astype(int)

    def set_threshold(self, threshold: float):
        self.threshold = threshold
        return self

    def save(self, model_path: Path, metadata_path: Path = None):
        model_path = Path(model_path)
        model_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, model_path)
        if metadata_path is not None:
            meta = {
                "threshold": self.threshold,
                "feature_names_in_": self.feature_names_in_,
                "random_state": self.random_state,
            }
            metadata_path.parent.mkdir(parents=True, exist_ok=True)
            with open(metadata_path, "w") as f:
                json.dump(meta, f, indent=2)

    @staticmethod
    def load(model_path: Path) -> "FraudModel":
        return joblib.load(Path(model_path))


def evaluate(X: pd.DataFrame, y: pd.Series, model: FraudModel, threshold: float = None) -> Dict[str, Any]:
    th = model.threshold if threshold is None else threshold
    y_proba = model.predict_proba(X)
    y_pred = (y_proba >= th).astype(int)
    return {
        "precision": precision_score(y, y_pred, zero_division=0),
        "recall": recall_score(y, y_pred, zero_division=0),
        "f1": f1_score(y, y_pred, zero_division=0),
        "roc_auc": roc_auc_score(y, y_proba),
        "pr_auc": average_precision_score(y, y_proba),
        "confusion_matrix": confusion_matrix(y, y_pred).tolist(),
        "threshold": th,
    }
