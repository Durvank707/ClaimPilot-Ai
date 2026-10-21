"""Phase 3 tests: runtime-artifact validation and path resolution.

These never touch real model binaries or datasets. They exercise the artifact
helpers with temporary files and drive path resolution with monkeypatched
settings, so no large artifact and no production database is involved.
"""
import re
from pathlib import Path

import pytest

from backend import artifacts
from backend import services
from backend.artifacts import MissingArtifactsError
from backend.config import PROJECT_ROOT, resolve_artifact_path, settings


# --- resolve_artifact_path --------------------------------------------------


def test_relative_path_is_anchored_to_project_root():
    resolved = resolve_artifact_path("models/fraud_model_v1.joblib")
    assert resolved == PROJECT_ROOT / "models" / "fraud_model_v1.joblib"
    assert resolved.is_absolute()


def test_absolute_path_is_returned_unchanged():
    absolute = Path("C:/artifacts/fraud.joblib")
    assert resolve_artifact_path(absolute) == absolute


# --- require_files ----------------------------------------------------------


def test_require_files_passes_when_all_present(tmp_path):
    a = tmp_path / "a.bin"
    a.write_bytes(b"x")
    # Should not raise.
    artifacts.require_files({"a": a})


def test_require_files_reports_every_missing_artifact(tmp_path):
    present = tmp_path / "present.bin"
    present.write_bytes(b"x")
    missing_one = tmp_path / "models" / "fraud_model_v1.joblib"
    missing_two = tmp_path / "data" / "processed_all.csv"

    with pytest.raises(MissingArtifactsError) as excinfo:
        artifacts.require_files(
            {"fraud model": missing_one, "processed dataset": missing_two, "ok": present}
        )

    message = str(excinfo.value)
    assert "fraud model" in message
    assert "processed dataset" in message
    # All missing paths are listed together so they can be fixed in one pass.
    assert str(missing_one) in message
    assert str(missing_two) in message
    # The present file is not reported.
    assert str(present) not in message


def test_require_files_error_is_actionable_and_secret_free(tmp_path):
    with pytest.raises(MissingArtifactsError) as excinfo:
        artifacts.require_files({"fraud model": tmp_path / "nope.joblib"})
    message = str(excinfo.value)
    # Points the reader at the documentation rather than only naming a path.
    assert "README.md" in message
    # No credential-like content is ever included.
    assert not re.search(r"password|token|secret|postgresql://", message, re.IGNORECASE)


def test_missing_files_returns_only_absent_entries(tmp_path):
    present = tmp_path / "present.bin"
    present.write_bytes(b"x")
    absent = tmp_path / "absent.bin"
    assert artifacts.missing_files([present, absent]) == [absent]


# --- ClaimAnalyzer wiring ---------------------------------------------------


def test_analyzer_raises_actionable_error_when_model_missing(monkeypatch, tmp_path):
    """A missing model stops construction with a clear message, not a raw OSError."""
    monkeypatch.setattr(settings, "fraud_model_path", str(tmp_path / "missing_fraud.joblib"))
    # Point every other artifact at a real, small file so only the model is missing.
    real_processed = tmp_path / "processed.csv"
    real_processed.write_text("claim_amount\n100\n", encoding="utf-8")
    monkeypatch.setattr(settings, "data_processed_path", str(real_processed))
    monkeypatch.setattr(settings, "severity_model_path", str(tmp_path / "s.joblib"))
    monkeypatch.setattr(settings, "anomaly_model_path", str(tmp_path / "a.joblib"))
    monkeypatch.setattr(settings, "risk_config_path", str(tmp_path / "r.json"))
    monkeypatch.setattr(settings, "decision_policy_path", str(tmp_path / "d.json"))
    for name in ("s.joblib", "a.joblib", "r.json", "d.json"):
        (tmp_path / name).write_text("x", encoding="utf-8")

    with pytest.raises(MissingArtifactsError) as excinfo:
        services.ClaimAnalyzer()

    assert "fraud model" in str(excinfo.value)


def test_analyzer_reads_reference_dataset_once(monkeypatch, tmp_path):
    """The processed CSV must be parsed once, not per request.

    A tiny CSV plus stubbed sub-models keeps this fast and independent of the
    real artifacts while proving the reference series is cached on the instance.
    """
    calls = {"count": 0}

    import backend.services as services_module

    real_read_csv = services_module.pd.read_csv

    def counting_read_csv(*args, **kwargs):
        calls["count"] += 1
        return real_read_csv(*args, **kwargs)

    processed = tmp_path / "processed_all.csv"
    processed.write_text("claim_amount\n100\n300\n500\n", encoding="utf-8")

    monkeypatch.setattr(settings, "data_processed_path", str(processed))
    monkeypatch.setattr(services_module.pd, "read_csv", counting_read_csv)

    # Stub the model/config loaders so no real binaries are needed.
    class FakeFraud:
        @staticmethod
        def load(_path):
            return FakeFraud()

        def predict_proba(self, _X):
            return [0.2]

    class FakeSev:
        @staticmethod
        def load(_path):
            return FakeSev()

        def predict(self, _X):
            return [250.0]

    class FakeAnom:
        @staticmethod
        def load(_path):
            return FakeAnom()

        def score(self, _X):
            return [-0.1]

    class FakeScorer:
        def __init__(self, _path):
            pass

        def normalize_severity(self, values, _ref):
            return [0.5]

        def score(self, *_a):
            return [42.0]

        def classify_risk(self, _v):
            return ["MEDIUM"]

    class FakeDE:
        def __init__(self, _path):
            pass

        def decide(self, *args):
            return {"recommendation": "ROUTINE_REVIEW", "human_decision_required": True}

    class FakeExplainer:
        def explain_risk(self, *args, **kwargs):
            return {"risk": {"summary": "stub"}}

    # Every required path must exist for require_files; create stand-ins.
    for name in ("f.joblib", "s.joblib", "a.joblib", "r.json", "d.json"):
        (tmp_path / name).write_text("x", encoding="utf-8")

    monkeypatch.setattr(settings, "fraud_model_path", str(tmp_path / "f.joblib"))
    monkeypatch.setattr(settings, "severity_model_path", str(tmp_path / "s.joblib"))
    monkeypatch.setattr(settings, "anomaly_model_path", str(tmp_path / "a.joblib"))
    monkeypatch.setattr(settings, "risk_config_path", str(tmp_path / "r.json"))
    monkeypatch.setattr(settings, "decision_policy_path", str(tmp_path / "d.json"))

    monkeypatch.setattr(services_module, "FraudModel", FakeFraud)
    monkeypatch.setattr(services_module, "SeverityModelSlim", FakeSev)
    monkeypatch.setattr(services_module, "AnomalyModel", FakeAnom)
    monkeypatch.setattr(services_module, "RiskScorer", FakeScorer)
    monkeypatch.setattr(services_module, "DecisionEngine", FakeDE)
    monkeypatch.setattr(services_module, "Explainer", FakeExplainer)

    analyzer = services_module.ClaimAnalyzer()
    assert calls["count"] == 1

    # Two analyses must not re-read the dataset.
    analyzer.analyze({"policy_id": "P1", "claim_amount": 100})
    analyzer.analyze({"policy_id": "P2", "claim_amount": 200})
    assert calls["count"] == 1


def test_real_analyzer_is_constructible_in_this_checkout():
    """The real artifacts are present locally, so the app analyzer loads.

    This documents the current environment; a fresh checkout without the
    gitignored artifacts is expected to fail loudly instead (see README).
    """
    from backend.dependencies import analyzer

    assert analyzer is not None
    assert analyzer.fraud is not None
    assert len(analyzer._reference_amounts) > 0
