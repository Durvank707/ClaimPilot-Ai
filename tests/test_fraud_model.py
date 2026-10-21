import sys
from pathlib import Path
import pandas as pd
import pytest

project_root = Path(__file__).resolve().parents[1]
src_path = project_root / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

from claimpilot.models.fraud_model import FraudModel


def test_fraud_model_infer():
    df = pd.read_csv(project_root / "data" / "processed" / "processed_all.csv")
    from claimpilot.features import sets

    X = df[sets.FRAUD_NUM_COLS + sets.FRAUD_CAT_COLS]
    y = df[sets.TARGET_FRAUD]
    model = FraudModel().fit(X.head(100), y.head(100), model_type="rf")
    proba = model.predict_proba(X.head(5))
    pred = model.predict(X.head(5))
    assert (proba >= 0).all() and (proba <= 1).all()
    assert all(p in (0, 1) for p in pred)
