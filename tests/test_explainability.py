import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from claimpilot.risk.explainer import Explainer


def test_explainer():
    e = Explainer()
    r = e.explain_risk(0.7, 0.8, 15000, 75, "HIGH", {"fraud": 35, "anomaly": 20, "severity": 20})
    assert r["risk"]["level"] == "HIGH"
    assert 0 <= r["risk"]["score"] <= 100
