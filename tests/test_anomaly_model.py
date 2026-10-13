import sys
from pathlib import Path
import pandas as pd
import pytest

project_root = Path(__file__).resolve().parents[1]
src_path = project_root / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

from claimpilot.models.anomaly_model import AnomalyModel
from claimpilot.features import sets


def test_anomaly_model_infer():
    df = pd.read_csv(project_root / "data" / "processed" / "processed_all.csv")
    X = df[sets.ANOMALY_NUM_COLS + sets.ANOMALY_CAT_COLS]
    assert "fraud_target" not in X.columns
    model = AnomalyModel().fit(X.head(200))
    scores = model.score(X.head(5))
    flags = model.predict_flag(X.head(5), threshold=0.0)
    assert scores.shape[0] == 5
    assert all(f in (0,1) for f in flags)
