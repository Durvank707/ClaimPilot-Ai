import json
from pathlib import Path
import numpy as np
import pandas as pd

DEFAULT_CONFIG = {
    "version": "1.0",
    "weights": {"fraud": 0.5, "anomaly": 0.25, "severity": 0.25},
    "risk_thresholds": {"low": 30, "medium": 60, "high": 80},
}


class RiskScorer:
    def __init__(self, config_path: Path = None):
        self.config = self.load_config(config_path)

    def load_config(self, config_path: Path = None):
        if config_path is not None and Path(config_path).exists():
            with open(config_path) as f:
                return json.load(f)
        # default to configs/risk_scoring.json
        default = Path("configs/risk_scoring.json")
        if default.exists():
            with open(default) as f:
                return json.load(f)
        return DEFAULT_CONFIG

    def normalize_severity(self, pred_amount: np.ndarray, ref: pd.Series) -> np.ndarray:
        # percentile-based 0-100
        scores = np.zeros_like(pred_amount, dtype=float)
        for i, v in enumerate(pred_amount):
            if pd.isna(v):
                scores[i] = 0.0
                continue
            p = (ref <= v).mean() * 100.0
            if p < 0: p = 0.0
            if p > 100: p = 100.0
            scores[i] = p
        return scores

    def score(self, fraud_prob: np.ndarray, anomaly_score: np.ndarray, severity_norm: np.ndarray) -> np.ndarray:
        w = self.config["weights"]
        s = w["fraud"] * (fraud_prob * 100.0) + w["anomaly"] * (anomaly_score * 100.0) + w["severity"] * severity_norm
        s = np.clip(s, 0, 100)
        return s

    def classify_risk(self, risk_score: np.ndarray) -> list:
        t = self.config["risk_thresholds"]
        out = []
        for v in risk_score:
            if v >= t["high"]: out.append("CRITICAL")
            elif v >= t["medium"]: out.append("HIGH")
            elif v >= t["low"]: out.append("MEDIUM")
            else: out.append("LOW")
        return out
