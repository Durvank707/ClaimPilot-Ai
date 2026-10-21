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

# baseline majority - legit
from collections import Counter
print('Train dist:', Counter(y_train))
print('Val dist:', Counter(y_val))
print('Test dist:', Counter(y_test))

# train small rf for quick check
model = FraudModel().fit(X_train.head(8000), y_train.head(8000), model_type='rf')
model.set_threshold(0.3)
m_val = evaluate(X_val, y_val, model)
m_test = evaluate(X_test, y_test, model)
print('VAL:', m_val)
print('TEST:', m_test)
model.save(project_root / 'models' / 'fraud_model_v1.joblib', project_root / 'models' / 'fraud_model_v1_metadata.json')
