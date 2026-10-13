import sys
from pathlib import Path
import numpy as np
import pandas as pd

project_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(project_root / "src"))

from sklearn.model_selection import train_test_split
from claimpilot.features import sets
from claimpilot.models.fraud_model import FraudModel
from claimpilot.models.severity_model_slim import SeverityModelSlim
from claimpilot.models.anomaly_model import AnomalyModel
from claimpilot.risk.scorer import RiskScorer

df = pd.read_csv(project_root / "data" / "processed" / "processed_all.csv")
Xf = df[sets.FRAUD_NUM_COLS + sets.FRAUD_CAT_COLS]
Xs = df[sets.SEVERITY_NUM_COLS + sets.SEVERITY_CAT_COLS]
Xa = df[sets.ANOMALY_NUM_COLS + sets.ANOMALY_CAT_COLS]
fraud = df["fraud_target"]

# split
Xf_train, Xf_test, _, _ = train_test_split(Xf, fraud, test_size=0.15, random_state=42)
Xs_train, Xs_test, _, _ = train_test_split(Xs, fraud, test_size=0.15, random_state=42)
Xa_train, Xa_test, f_test, _ = train_test_split(Xa, fraud, test_size=0.15, random_state=42)

# load or quick train small
fraud_model = FraudModel().fit(Xf_train.head(5000), fraud.iloc[Xf_train.index[:5000]], model_type="rf")
sev_model = SeverityModelSlim().fit(Xs_train.head(5000), df["claim_amount"].iloc[Xs_train.index[:5000]], model_type="linear")
anom_model = AnomalyModel().fit(Xa_train.head(2000))

# predict on test
fp = fraud_model.predict_proba(Xf_test.head(1000))
sp = sev_model.predict(Xs_test.head(1000))
ap = anom_model.score(Xa_test.head(1000))

scorer = RiskScorer()
sev_norm = scorer.normalize_severity(sp, df["claim_amount"].iloc[Xs_train.index])
risk = scorer.score(fp, ap, sev_norm[:1000])
levels = scorer.classify_risk(risk)
res = pd.DataFrame({"fp": fp, "sp": sp, "ap": ap, "risk": risk, "level": levels, "fraud": f_test.iloc[:1000].values})
print(res.groupby("level")["fraud"].agg(["count", "mean"]))
