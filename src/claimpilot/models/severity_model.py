import json
from pathlib import Path
from typing import Any, Dict
import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
from xgboost import XGBRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


class SeverityModel:
    def __init__(self, random_state: int = 42):
        self.random_state = random_state
        self.pipeline = None
        self.feature_names_in_ = None

    def build_pipeline(self, model_type: str = "xgboost"):
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
        if model_type == "linear":
            clf = LinearRegression()
        elif model_type == "rf":
            clf = RandomForestRegressor(n_estimators=200, random_state=self.random_state, n_jobs=-1)
        elif model_type == "xgboost":
            clf = XGBRegressor(n_estimators=300, max_depth=4, learning_rate=0.1, random_state=self.random_state, n_jobs=-1)
        else:
            clf = XGBRegressor(n_estimators=200, max_depth=3, learning_rate=0.1, random_state=self.random_state, n_jobs=-1)
        self.pipeline = Pipeline([("pre", preproc), ("reg", clf)])
        return self.pipeline

    def fit(self, X: pd.DataFrame, y: pd.Series, model_type: str = "xgboost") -> "SeverityModel":
        self.build_pipeline(model_type=model_type)
        self.pipeline.fit(X, y)
        self.feature_names_in_ = X.columns.tolist()
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return self.pipeline.predict(X)

    def save(self, model_path: Path, metadata_path: Path = None):
        model_path = Path(model_path)
        model_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, model_path)
        if metadata_path is not None:
            meta = {
                "feature_names_in_": self.feature_names_in_,
                "random_state": self.random_state,
            }
            metadata_path.parent.mkdir(parents=True, exist_ok=True)
            with open(metadata_path, "w") as f:
                json.dump(meta, f, indent=2)

    @staticmethod
    def load(model_path: Path) -> "SeverityModel":
        return joblib.load(Path(model_path))


def evaluate_reg(X: pd.DataFrame, y: pd.Series, model: SeverityModel) -> Dict[str, Any]:
    y_pred = model.predict(X)
    return {
        "mae": mean_absolute_error(y, y_pred),
        "rmse": np.sqrt(mean_squared_error(y, y_pred)),
        "r2": r2_score(y, y_pred),
    }
