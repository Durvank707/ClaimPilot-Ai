from pathlib import Path
import json
import pandas as pd
import numpy as np

class Explainer:
    def __init__(self):
        pass

    def explain_risk(self, fraud_prob, anomaly_score, severity_pred, risk_score, risk_level, components, summary=None):
        return {
            "fraud": {"probability": float(fraud_prob)},
            "anomaly": {"score": float(anomaly_score)},
            "severity": {"predicted_amount": float(severity_pred)},
            "risk": {
                "score": float(risk_score),
                "level": risk_level,
                "components": components,
                "summary": summary or "Risk score combines fraud, anomaly, and severity signals for prioritization.",
            },
        }

    def explain_fraud(self, fraud_prob, top_positive=None, top_negative=None):
        return {
            "prediction": {"fraud_probability": float(fraud_prob)},
            "top_positive_factors": top_positive or [],
            "top_negative_factors": top_negative or [],
        }

    def explain_severity(self, pred_amount, factors=None):
        return {
            "predicted_amount": float(pred_amount),
            "top_factors": factors or [],
        }

    def explain_anomaly(self, score, reasons=None):
        return {
            "score": float(score),
            "reasons": reasons or [],
        }
