import sys
from pathlib import Path
import pandas as pd
import pytest

project_root = Path(__file__).resolve().parents[1]
src_path = project_root / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

from claimpilot.models.severity_model import SeverityModel


def test_severity_model_infer():
    df = pd.read_csv(project_root / "data" / "processed" / "processed_all.csv")
    from claimpilot.features import sets

    X = df[sets.SEVERITY_NUM_COLS + sets.SEVERITY_CAT_COLS]
    y = df[sets.TARGET_SEVERITY]
    model = SeverityModel().fit(X.head(100), y.head(100), model_type="rf")
    pred = model.predict(X.head(5))
    assert pred.shape[0] == 5
    assert (pred >= 0).all()
