import sys
from pathlib import Path
import numpy as np
import pandas as pd

project_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(project_root / "src"))

from claimpilot.risk.scorer import RiskScorer


def test_risk_scoring():
    scorer = RiskScorer()
    risk = scorer.score(np.array([0.7]), np.array([0.8]), np.array([60.0]))
    assert len(risk) == 1
    assert 0 <= risk[0] <= 100
    levels = scorer.classify_risk(np.array([10, 40, 70, 90]))
    assert levels == ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
