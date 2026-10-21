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

from backend.artifacts import require_files
from backend.config import resolve_artifact_path, settings


class ClaimAnalyzer:
    def __init__(self):
        # Resolve every artifact from the project root (or an absolute override)
        # and fail once, up front, with an actionable message if any is missing.
        # Without this a missing model surfaces as an opaque joblib error.
        fraud_path = resolve_artifact_path(settings.fraud_model_path)
        sev_path = resolve_artifact_path(settings.severity_model_path)
        anom_path = resolve_artifact_path(settings.anomaly_model_path)
        risk_path = resolve_artifact_path(settings.risk_config_path)
        decision_path = resolve_artifact_path(settings.decision_policy_path)
        processed_path = resolve_artifact_path(settings.data_processed_path)

        require_files(
            {
                "fraud model": fraud_path,
                "severity model": sev_path,
                "anomaly model": anom_path,
                "risk scoring config": risk_path,
                "decision policy config": decision_path,
                "processed reference dataset": processed_path,
            }
        )

        self.fraud = FraudModel.load(fraud_path)
        self.sev = SeverityModelSlim.load(sev_path)
        self.anom = AnomalyModel.load(anom_path)
        self.scorer = RiskScorer(risk_path)
        self.de = DecisionEngine(decision_path)
        self.explainer = Explainer()

        # Read the reference claim amounts once. Previously this file was read
        # on every ``analyze`` call, re-parsing a multi-megabyte CSV per request
        # for an unchanging distribution. Caching the series produces identical
        # numbers while removing the repeated work.
        self._reference_amounts = pd.read_csv(processed_path)["claim_amount"]

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

        ref = self._reference_amounts
        sn = float(self.scorer.normalize_severity(np.array([sp]), ref)[0])
        riskv = float(self.scorer.score(np.array([fp]), np.array([ap]), np.array([sn]))[0])
        level = self.scorer.classify_risk(np.array([riskv]))[0]
        try:
            amt_pct = float((ref <= sp).mean())
        except Exception:
            amt_pct = 0.5
        dec = self.de.decide(fp, ap, sp, riskv, level, amt_pct)
        exp = self.explainer.explain_risk(fp, ap, sp, riskv, level, {"fraud": fp*100, "anomaly": ap*100, "severity": sn})
        res = {
            "claim_id": data.get("policy_id"),
            "fraud": {"probability": fp},
            "severity": {"predicted_claim_amount": sp},
            "anomaly": {"score": ap},
            "risk": {"score": riskv, "level": level},
            "explanation": exp,
            "decision": dec
        }
        return res
