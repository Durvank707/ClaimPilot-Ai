import sys
from pathlib import Path
import pandas as pd
import numpy as np

project_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(project_root / "src"))

from sklearn.model_selection import train_test_split
from claimpilot.features import sets
from claimpilot.models.anomaly_model import AnomalyModel

df = pd.read_csv(project_root / "data" / "processed" / "processed_all.csv")
X = df[sets.ANOMALY_NUM_COLS + sets.ANOMALY_CAT_COLS]
assert "fraud_target" not in X.columns
fraud = df["fraud_target"]

# split
X_train, X_test, f_train, f_test = train_test_split(X, fraud, test_size=0.15, random_state=42)
X_train, X_val, f_train, f_val = train_test_split(X_train, f_train, test_size=0.15, random_state=42)

# train on train
model = AnomalyModel(contamination=0.1).fit(X_train.head(4000))
# score
s_val = model.score(X_val)
# top k
top5 = s_val.argsort()[-int(len(s_val)*0.05):]
print("Top5% fraud rate:", f_val.iloc[top5].mean())
print("Overall fraud rate:", f_val.mean())
model.save(project_root / "models" / "anomaly_model_v1.joblib", project_root / "models" / "anomaly_model_v1_metadata.json")
