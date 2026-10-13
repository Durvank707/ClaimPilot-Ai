import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from claimpilot.risk.decision_engine import DecisionEngine


def test_decision_engine():
    de = DecisionEngine()
    res = de.decide(0.1, 0.1, 1000, 10, "LOW")
    assert res["recommendation"] == "ROUTINE_REVIEW"
    assert res["human_decision_required"] is True
    assert res["policy_version"] == "1.0"
