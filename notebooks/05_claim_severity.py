import sys
from pathlib import Path
import pandas as pd
import numpy as np

project_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(project_root / "src"))

from sklearn.model_selection import train_test_split
from claimpilot.features import sets
from claimpilot.models.severity_model import SeverityModel, evaluate_reg

df = pd.read_csv(project_root / "data" / "processed" / "processed_all.csv")
X = df[sets.SEVERITY_NUM_COLS + sets.SEVERITY_CAT_COLS]
y = df[sets.TARGET_SEVERITY]

# leakage check: ensure claim_amount not in X
assert "claim_amount" not in X.columns

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.15, random_state=42)
X_train, X_val, y_train, y_val = train_test_split(X_train, y_train, test_size=0.15, random_state=42)

# baselines
mean_pred = np.full(len(y_val), y_train.mean())
med_pred = np.full(len(y_val), y_train.median())
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

def reg_metrics(y_true, y_pred):
    return {"mae": mean_absolute_error(y_true, y_pred), "rmse": np.sqrt(mean_squared_error(y_true, y_pred)), "r2": r2_score(y_true, y_pred)}

print("Baselines (val):")
print("mean:", reg_metrics(y_val, mean_pred))
print("median:", reg_metrics(y_val, med_pred))

# train small rf
model = SeverityModel().fit(X_train.head(8000), y_train.head(8000), model_type="rf")
m_val = evaluate_reg(X_val, y_val, model)
m_test = evaluate_reg(X_test, y_test, model)
print("VAL:", m_val)
print("TEST:", m_test)

model.save(project_root / "models" / "severity_model_v1.joblib", project_root / "models" / "severity_model_v1_metadata.json")
