import sys
from pathlib import Path
import pandas as pd

project_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(project_root / "src"))

from sklearn.model_selection import train_test_split
from claimpilot.features import sets
from claimpilot.models.fraud_model import FraudModel, evaluate

df = pd.read_csv(project_root / "data" / "processed" / "processed_all.csv")
X = df[sets.FRAUD_NUM_COLS + sets.FRAUD_CAT_COLS]
y = df[sets.TARGET_FRAUD]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.15, stratify=y, random_state=42)
X_train, X_val, y_train, y_val = train_test_split(X_train, y_train, test_size=0.15, stratify=y_train, random_state=42)

model = FraudModel().fit(X_train, y_train, model_type="xgboost")
model.set_threshold(0.3)
metrics = evaluate(X_val, y_val, model)
print(metrics)
