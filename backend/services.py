import pandas as pd
import numpy as np
from pathlib import Path
from claimpilot.models.fraud_model import FraudModel
from claimpilot.models.severity_model_slim import SeverityModelSlim
from claimpilot.models.anomaly_model import AnomalyModel
from claimpilot.risk.scorer import RiskScorer
from claimpilot.risk.decision_engine import DecisionEngine
from claimpilot.risk.explainer import Explainer
from claimpilot.features import sets

from backend.config import settings

class ClaimAnalyzer:
    def __init__(self):
        self.fraud = FraudModel.load(Path(settings.fraud_model_path))
        self.sev = SeverityModelSlim.load(Path(settings.severity_model_path))
        self.anom = AnomalyModel.load(Path(settings.anomaly_model_path))
        self.scorer = RiskScorer(Path(settings.risk_config_path))
        self.de = DecisionEngine(Path(settings.decision_policy_path))
        self.explainer = Explainer()

    def analyze(self, data: dict):
        data = data or {}
        df = pd.DataFrame([data])
        Xf = df.reindex(columns=sets.FRAUD_NUM_COLS + sets.FRAUD_CAT_COLS, fill_value=0)
        Xs = df.reindex(columns=sets.SEVERITY_NUM_COLS + sets.SEVERITY_CAT_COLS, fill_value=0)
        Xa = df.reindex(columns=sets.ANOMALY_NUM_COLS + sets.ANOMALY_CAT_COLS, fill_value=0)

        for col in sets.FRAUD_NUM_COLS:
            if col in Xf:
                Xf[col] = pd.to_numeric(Xf[col], errors="coerce").fillna(0)
        for col in sets.SEVERITY_NUM_COLS:
            if col in Xs:
                Xs[col] = pd.to_numeric(Xs[col], errors="coerce").fillna(0)
        for col in sets.ANOMALY_NUM_COLS:
            if col in Xa:
                Xa[col] = pd.to_numeric(Xa[col], errors="coerce").fillna(0)

        for col in sets.FRAUD_CAT_COLS:
            if col in Xf:
                Xf[col] = Xf[col].astype(str).replace("nan", "Unknown").fillna("Unknown")
        for col in sets.SEVERITY_CAT_COLS:
            if col in Xs:
                Xs[col] = Xs[col].astype(str).replace("nan", "Unknown").fillna("Unknown")
        for col in sets.ANOMALY_CAT_COLS:
            if col in Xa:
                Xa[col] = Xa[col].astype(str).replace("nan", "Unknown").fillna("Unknown")

        if "incident_date" in df and df["incident_date"].iloc[0] is not None:
            try:
                dt = pd.to_datetime(df["incident_date"].iloc[0])
                Xf["incident_month"] = int(dt.month); Xf["incident_day_of_week"] = int(dt.dayofweek)
                Xs["incident_month"] = int(dt.month); Xs["incident_day_of_week"] = int(dt.dayofweek)
                Xa["incident_month"] = int(dt.month); Xa["incident_day_of_week"] = int(dt.dayofweek)
            except Exception:
                pass
        if "police_report_available" in df and df["police_report_available"].iloc[0] is not None:
            v = str(df["police_report_available"].iloc[0]).lower()
            b = 1 if v == "yes" else 0
            Xf["police_report_available_bin"] = b; Xs["police_report_available_bin"] = b; Xa["police_report_available_bin"] = b

        fp = float(self.fraud.predict_proba(Xf)[0])
        sp = float(self.sev.predict(Xs)[0])
        ap = float(self.anom.score(Xa)[0])

        ref = pd.read_csv(Path("data/processed/processed_all.csv"))["claim_amount"]
        sn = float(self.scorer.normalize_severity(np.array([sp]), ref)[0])
        riskv = float(self.scorer.score(np.array([fp]), np.array([ap]), np.array([sn]))[0])
        level = self.scorer.classify_risk(np.array([riskv]))[0]
        try:
            amt_pct = float((ref <= sp).mean())
        except Exception:
            amt_pct = 0.5
        dec = self.de.decide(fp, ap, sp, riskv, level, amt_pct)
        exp = self.explainer.explain_risk(fp, ap, sp, riskv, level, {"fraud": fp*100, "anomaly": ap*100, "severity": sn})
        return {
            "claim_id": data.get("policy_id"),
            "fraud": {"probability": fp},
            "severity": {"predicted_claim_amount": sp},
            "anomaly": {"score": ap},
            "risk": {"score": riskv, "level": level},
            "explanation": exp,
            "decision": dec
        }
