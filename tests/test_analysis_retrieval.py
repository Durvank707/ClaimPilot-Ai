"""Tests for full analysis retrieval: GET /api/v1/analyses/{analysis_id}.

The endpoint must reconstruct a previously persisted analysis from the database
only, without invoking the ML analyzer. These tests use the shared temporary
file-based SQLite setup from ``conftest.py``.
"""
import copy

from backend.db import models
from backend.routers import claims as claims_router


# A realistically shaped analysis result with a full explanation (including the
# risk component breakdown) and the complete decision payload.
STORED_RESULT = {
    "claim_id": None,
    "fraud": {"probability": 0.13},
    "severity": {"predicted_claim_amount": 11148.6},
    "anomaly": {"score": -0.0243},
    "risk": {"score": 19.59, "level": "LOW"},
    "explanation": {
        "fraud": {"probability": 0.13},
        "anomaly": {"score": -0.0243},
        "severity": {"predicted_amount": 11148.6},
        "risk": {
            "score": 19.59,
            "level": "LOW",
            "components": {"fraud": 13.0, "anomaly": -2.4285, "severity": 54.7767},
            "summary": "Risk score combines fraud, anomaly, and severity signals.",
        },
    },
    "decision": {
        "recommendation": "ROUTINE_REVIEW",
        "priority": "LOW",
        "risk_score": 19.59,
        "risk_level": "LOW",
        "reasons": ["Overall risk score is 19.6 (LOW)."],
        "suggested_actions": ["Perform additional claim verification."],
        "triggered_rules": [],
        "policy_version": "1.0",
        "human_decision_required": True,
    },
}

ANALYZE_URL = "/api/v1/claims/analyze"
DETAIL_URL = "/api/v1/analyses/{analysis_id}"


def _store_analysis(client, monkeypatch, policy_id="POL-RET"):
    """Submit a claim (with a stubbed analyzer) and return its analysis_id."""

    def fake(data):
        result = copy.deepcopy(STORED_RESULT)
        result["claim_id"] = data.get("policy_id")
        return result

    monkeypatch.setattr(claims_router.analyzer, "analyze", fake)
    response = client.post(ANALYZE_URL, json={"policy_id": policy_id})
    assert response.status_code == 200
    assert response.json()["persisted"] is True
    return response.json()["analysis_id"]


def test_saved_analysis_can_be_retrieved(client, sqlite_db, monkeypatch):
    analysis_id = _store_analysis(client, monkeypatch)

    response = client.get(DETAIL_URL.format(analysis_id=analysis_id))

    assert response.status_code == 200
    body = response.json()
    assert body["analysis_id"] == analysis_id
    # No internal integer primary key is exposed.
    assert "id" not in body


def test_returned_identifier_matches_persisted_record(client, sqlite_db, monkeypatch):
    analysis_id = _store_analysis(client, monkeypatch)
    _, Session = sqlite_db

    response = client.get(DETAIL_URL.format(analysis_id=analysis_id))

    with Session() as session:
        stored = session.query(models.ClaimAnalysis).one()
    assert response.json()["analysis_id"] == stored.analysis_id == analysis_id


def test_response_contains_persisted_signal_data(client, sqlite_db, monkeypatch):
    analysis_id = _store_analysis(client, monkeypatch)

    body = client.get(DETAIL_URL.format(analysis_id=analysis_id)).json()

    assert body["fraud"] == {"probability": 0.13}
    assert body["severity"] == {"predicted_claim_amount": 11148.6}
    assert body["anomaly"] == {"score": -0.0243}
    assert body["risk"] == {
        "score": 19.59,
        "level": "LOW",
        "components": {"fraud": 13.0, "anomaly": -2.4285, "severity": 54.7767},
    }
    assert body["explanation"] == STORED_RESULT["explanation"]
    assert body["decision"] == STORED_RESULT["decision"]
    # Decision fields recoverable from storage.
    assert body["decision"]["recommendation"] == "ROUTINE_REVIEW"
    assert body["decision"]["priority"] == "LOW"
    assert body["decision"]["policy_version"] == "1.0"
    assert body["decision"]["triggered_rules"] == []
    assert body["decision"]["human_decision_required"] is True


def test_associated_claim_id_is_correct(client, sqlite_db, monkeypatch):
    analysis_id = _store_analysis(client, monkeypatch, policy_id="POL-CLAIM-42")

    body = client.get(DETAIL_URL.format(analysis_id=analysis_id)).json()

    assert body["claim_id"] == "POL-CLAIM-42"


def test_analyzed_at_is_serialized(client, sqlite_db, monkeypatch):
    analysis_id = _store_analysis(client, monkeypatch)

    body = client.get(DETAIL_URL.format(analysis_id=analysis_id)).json()

    assert isinstance(body["analyzed_at"], str)
    assert body["analyzed_at"]


def test_unknown_analysis_id_returns_404(client, sqlite_db):
    response = client.get(DETAIL_URL.format(analysis_id="does-not-exist"))
    assert response.status_code == 404
    assert response.json()["detail"] == "Analysis not found"


def test_legacy_row_with_null_fields_serializes(client, sqlite_db):
    """A row missing optional/legacy data must not crash serialization."""
    _, Session = sqlite_db
    with Session() as session:
        session.add(
            models.ClaimAnalysis(
                analysis_id="LEGACY-1",
                claim_id_fk=None,
                fraud_probability=None,
                predicted_claim_amount=None,
                anomaly_score=None,
                risk_score=None,
                risk_level=None,
                explanation=None,
                recommendation=None,
                triggered_rules=None,
                policy_versions=None,
            )
        )
        session.commit()

    response = client.get(DETAIL_URL.format(analysis_id="LEGACY-1"))

    assert response.status_code == 200
    body = response.json()
    assert body["analysis_id"] == "LEGACY-1"
    assert body["claim_id"] is None
    # Missing values stay null; the endpoint does not invent zeros/defaults.
    assert body["fraud"] == {"probability": None}
    assert body["severity"] == {"predicted_claim_amount": None}
    assert body["anomaly"] == {"score": None}
    assert body["risk"] == {"score": None, "level": None, "components": None}
    assert body["explanation"] is None
    assert body["decision"] is None


def test_retrieval_does_not_invoke_the_ml_analyzer(client, sqlite_db, monkeypatch):
    analysis_id = _store_analysis(client, monkeypatch)

    calls = []

    def exploding_analyze(data):
        calls.append(data)
        raise AssertionError("ML analyzer must not be called during retrieval")

    monkeypatch.setattr(claims_router.analyzer, "analyze", exploding_analyze)

    response = client.get(DETAIL_URL.format(analysis_id=analysis_id))

    assert response.status_code == 200
    assert calls == []


def test_claim_endpoint_still_works(client, sqlite_db, monkeypatch):
    _store_analysis(client, monkeypatch, policy_id="POL-ENDPOINT")

    response = client.get("/api/v1/claims/POL-ENDPOINT")

    assert response.status_code == 200
    body = response.json()
    assert body["claim_id"] == "POL-ENDPOINT"
    assert "created_at" in body
    assert client.get("/api/v1/claims/unknown-claim").status_code == 404


def test_missing_record_does_not_return_a_placeholder(client, sqlite_db):
    """No fabricated success payload for a missing record."""
    response = client.get(DETAIL_URL.format(analysis_id="missing"))
    assert response.status_code == 404
    assert response.json() == {"detail": "Analysis not found"}


def test_response_uses_nested_dashboard_structure(client, sqlite_db, monkeypatch):
    analysis_id = _store_analysis(client, monkeypatch)

    body = client.get(DETAIL_URL.format(analysis_id=analysis_id)).json()

    assert set(body.keys()) == {
        "analysis_id",
        "claim_id",
        "analyzed_at",
        "fraud",
        "severity",
        "anomaly",
        "risk",
        "explanation",
        "decision",
    }
