import json
from pathlib import Path
import numpy as np

DEFAULT = {
  "policy_version": "1.0",
  "recommendations": {
    "routine_review": {"min": 0, "max": 29},
    "enhanced_review": {"min": 30, "max": 59},
    "urgent_review": {"min": 60, "max": 79},
    "specialist_review": {"min": 80, "max": 100}
  },
  "elevated_fraud_threshold": 0.7,
  "elevated_anomaly_threshold": 0.8,
  "high_amount_pctile": 90
}

class DecisionEngine:
    def __init__(self, config_path=None):
        self.config = self._load(config_path)

    def _load(self, config_path):
        if config_path and Path(config_path).exists():
            with open(config_path) as f: return json.load(f)
        d = Path("configs/decision_policy.json")
        if d.exists():
            with open(d) as f: return json.load(f)
        return DEFAULT

    def decide(self, fraud_prob, anomaly_score, severity_pred, risk_score, risk_level, amount_pctile=0.5):
        reasons = []
        triggered = []
        reasons.append(f"Overall risk score is {risk_score:.1f} ({risk_level}).")
        if fraud_prob >= self.config["elevated_fraud_threshold"]:
            reasons.append("Fraud model assigned an elevated fraud probability.")
            triggered.append("elevated_fraud")
        if anomaly_score >= self.config["elevated_anomaly_threshold"]:
            reasons.append("Claim characteristics are unusually anomalous.")
            triggered.append("elevated_anomaly")
        if amount_pctile >= self.config["high_amount_pctile"]/100.0:
            reasons.append("Predicted claim amount is relatively high.")
            triggered.append("high_amount")

        if risk_score >= 80 or ("elevated_fraud" in triggered and "elevated_anomaly" in triggered):
            rec = "SPECIALIST_REVIEW"
            priority = "HIGH"
        elif risk_score >= 60:
            rec = "URGENT_REVIEW"
            priority = "HIGH"
        elif risk_score >= 30:
            rec = "ENHANCED_REVIEW"
            priority = "MEDIUM"
        else:
            rec = "ROUTINE_REVIEW"
            priority = "LOW"
        if "critical_risk" not in triggered and risk_score >= 80: triggered.append("critical_risk")
        return {
            "recommendation": rec,
            "priority": priority,
            "risk_score": float(risk_score),
            "risk_level": risk_level,
            "reasons": reasons,
            "suggested_actions": [
                "Perform additional claim verification.",
                "Review supporting documentation.",
                "Escalate for specialist assessment before final disposition."
            ],
            "triggered_rules": triggered,
            "policy_version": self.config["policy_version"],
            "human_decision_required": True
        }
