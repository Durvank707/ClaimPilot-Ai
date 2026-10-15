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
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


class SeverityModelSlim:
    def __init__(self, random_state: int = 42, max_cat: int = 50):
        self.random_state = random_state
        self.max_cat = max_cat

    def fit(self, X: pd.DataFrame, y: pd.Series, model_type: str = "linear"):
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
        if model_type == "linear":
            reg = LinearRegression()
        else:
            reg = RandomForestRegressor(n_estimators=50, max_depth=8, random_state=self.random_state, n_jobs=1)
        self.pipeline = Pipeline([("pre", preproc), ("reg", reg)])
        self.pipeline.fit(X, y)
        return self

    def predict(self, X: pd.DataFrame):
        return self.pipeline.predict(X)

    def save(self, p): joblib.dump(self, p)

    @staticmethod
    def load(p): return joblib.load(p)


def evaluate_reg(X, y, m):
    yp = m.predict(X)
    return {"mae": mean_absolute_error(y, yp), "rmse": np.sqrt(mean_squared_error(y, yp)), "r2": r2_score(y, yp)}
