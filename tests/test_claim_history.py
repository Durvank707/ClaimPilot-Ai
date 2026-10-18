"""Tests for expanded claim details and paginated analysis history.

Covers:
- GET /api/v1/claims/{claim_id}
- GET /api/v1/claims/{claim_id}/analyses
The shared temporary file-based SQLite fixtures from ``conftest.py`` are used.
Data is inserted directly so ordering/pagination can be controlled precisely.
"""
import copy
from datetime import datetime

from backend.db import models
from backend.routers import claims as claims_router


ANALYZE_URL = "/api/v1/claims/analyze"

RESULT = {
    "claim_id": None,
    "fraud": {"probability": 0.13},
    "severity": {"predicted_claim_amount": 11148.6},
    "anomaly": {"score": -0.0243},
    "risk": {"score": 19.59, "level": "LOW"},
    "explanation": {"risk": {"score": 19.59, "level": "LOW"}},
    "decision": {"recommendation": "ROUTINE_REVIEW", "priority": "LOW"},
}


def _stub_analyzer(monkeypatch):
    def fake(data):
        result = copy.deepcopy(RESULT)
        result["claim_id"] = data.get("policy_id")
        return result

    monkeypatch.setattr(claims_router.analyzer, "analyze", fake)


def _add_claim(Session, claim_id, **fields):
    with Session() as session:
        claim = models.Claim(claim_id=claim_id, **fields)
        session.add(claim)
        session.commit()
        session.refresh(claim)
        return claim.id


def _add_analysis(Session, claim_fk, analysis_id, analyzed_at=None, **fields):
    with Session() as session:
        analysis = models.ClaimAnalysis(
            analysis_id=analysis_id,
            claim_id_fk=claim_fk,
            analyzed_at=analyzed_at,
            **fields,
        )
        session.add(analysis)
        session.commit()


def _ids(body):
    return [item["analysis_id"] for item in body["items"]]


# --- Claim details ---------------------------------------------------------

def test_claim_lookup_returns_persisted_details(client, sqlite_db, monkeypatch):
    _stub_analyzer(monkeypatch)
    posted = client.post(
        ANALYZE_URL,
        json={
            "policy_id": "POL-DETAIL",
            "policy_state": "CA",
            "claim_amount": 5000,
            "incident_type": "Parked Car",
            "incident_date": "2024-05-01",
        },
    )
    assert posted.status_code == 200

    response = client.get("/api/v1/claims/POL-DETAIL")

    assert response.status_code == 200
    body = response.json()
    assert body["claim_id"] == "POL-DETAIL"
    assert body["policy_id"] == "POL-DETAIL"
    assert body["policy_state"] == "CA"
    assert body["claim_amount"] == 5000
    assert body["incident_type"] == "Parked Car"
    assert body["incident_date"] == "2024-05-01"
    assert body["created_at"]
    assert "id" not in body


def test_unknown_claim_lookup_returns_404(client, sqlite_db):
    response = client.get("/api/v1/claims/nope")
    assert response.status_code == 404
    assert response.json()["detail"] == "Claim not found"


def test_claim_lookup_handles_nullable_fields(client, sqlite_db):
    _, Session = sqlite_db
    _add_claim(Session, "POL-NULL")

    body = client.get("/api/v1/claims/POL-NULL").json()

    assert body["claim_id"] == "POL-NULL"
    assert body["policy_id"] is None
    assert body["policy_state"] is None
    assert body["claim_amount"] is None
    assert body["incident_type"] is None
    assert body["incident_date"] is None


# --- History: basics -------------------------------------------------------

def test_history_for_claim_with_no_analyses_is_empty(client, sqlite_db):
    _, Session = sqlite_db
    _add_claim(Session, "POL-EMPTY")

    response = client.get("/api/v1/claims/POL-EMPTY/analyses")

    assert response.status_code == 200
    body = response.json()
    assert body == {"items": [], "total": 0, "limit": 20, "offset": 0}


def test_history_unknown_claim_returns_404(client, sqlite_db):
    response = client.get("/api/v1/claims/missing/analyses")
    assert response.status_code == 404
    assert response.json()["detail"] == "Claim not found"


def test_history_includes_only_the_requested_claims_analyses(client, sqlite_db):
    _, Session = sqlite_db
    a_id = _add_claim(Session, "POL-A")
    b_id = _add_claim(Session, "POL-B")
    _add_analysis(Session, a_id, "A-1", datetime(2024, 1, 1), risk_score=10.0)
    _add_analysis(Session, a_id, "A-2", datetime(2024, 1, 2), risk_score=20.0)
    _add_analysis(Session, b_id, "B-1", datetime(2024, 1, 3), risk_score=30.0)

    body = client.get("/api/v1/claims/POL-A/analyses").json()

    assert body["total"] == 2
    assert set(_ids(body)) == {"A-1", "A-2"}


def test_history_item_shape(client, sqlite_db):
    _, Session = sqlite_db
    claim_id = _add_claim(Session, "POL-SHAPE")
    _add_analysis(
        Session,
        claim_id,
        "S-1",
        datetime(2024, 2, 1),
        fraud_probability=0.42,
        predicted_claim_amount=9000.5,
        anomaly_score=0.17,
        risk_score=55.0,
        risk_level="MEDIUM",
        recommendation={"recommendation": "ENHANCED_REVIEW", "priority": "MEDIUM"},
    )

    body = client.get("/api/v1/claims/POL-SHAPE/analyses").json()
    item = body["items"][0]

    assert set(item.keys()) == {
        "analysis_id",
        "analyzed_at",
        "fraud_probability",
        "predicted_claim_amount",
        "anomaly_score",
        "risk_score",
        "risk_level",
        "recommendation",
    }
    assert item["analysis_id"] == "S-1"
    assert item["fraud_probability"] == 0.42
    assert item["predicted_claim_amount"] == 9000.5
    assert item["anomaly_score"] == 0.17
    assert item["risk_score"] == 55.0
    assert item["risk_level"] == "MEDIUM"
    assert item["recommendation"] == "ENHANCED_REVIEW"
    # Lightweight: no full payloads or internal ids.
    assert "explanation" not in item
    assert "decision" not in item
    assert "id" not in item


# --- History: ordering -----------------------------------------------------

def test_history_defaults_to_newest_first(client, sqlite_db):
    _, Session = sqlite_db
    claim_id = _add_claim(Session, "POL-ORDER")
    _add_analysis(Session, claim_id, "O-1", datetime(2024, 1, 1))
    _add_analysis(Session, claim_id, "O-2", datetime(2024, 1, 3))
    _add_analysis(Session, claim_id, "O-3", datetime(2024, 1, 2))

    body = client.get("/api/v1/claims/POL-ORDER/analyses").json()

    assert _ids(body) == ["O-2", "O-3", "O-1"]


def test_history_ascending_order(client, sqlite_db):
    _, Session = sqlite_db
    claim_id = _add_claim(Session, "POL-ASC")
    _add_analysis(Session, claim_id, "C-1", datetime(2024, 1, 1))
    _add_analysis(Session, claim_id, "C-2", datetime(2024, 1, 3))
    _add_analysis(Session, claim_id, "C-3", datetime(2024, 1, 2))

    body = client.get("/api/v1/claims/POL-ASC/analyses?order=asc").json()

    assert _ids(body) == ["C-1", "C-3", "C-2"]


def test_history_equal_timestamps_use_deterministic_secondary_order(client, sqlite_db):
    _, Session = sqlite_db
    claim_id = _add_claim(Session, "POL-TIE")
    same = datetime(2024, 6, 1, 12, 0, 0)
    _add_analysis(Session, claim_id, "T-1", same)
    _add_analysis(Session, claim_id, "T-2", same)
    _add_analysis(Session, claim_id, "T-3", same)

    desc = client.get("/api/v1/claims/POL-TIE/analyses?order=desc").json()
    asc = client.get("/api/v1/claims/POL-TIE/analyses?order=asc").json()

    # Tie-break is the internal primary key: insertion order reversed/normal.
    assert _ids(desc) == ["T-3", "T-2", "T-1"]
    assert _ids(asc) == ["T-1", "T-2", "T-3"]


# --- History: pagination and validation ------------------------------------

def test_history_pagination_and_total(client, sqlite_db):
    _, Session = sqlite_db
    claim_id = _add_claim(Session, "POL-PAGE")
    for i in range(5):
        _add_analysis(Session, claim_id, f"P-{i}", datetime(2024, 3, 1 + i))

    page = client.get("/api/v1/claims/POL-PAGE/analyses?limit=2&offset=1").json()

    # Newest-first: P-4, P-3, P-2, P-1, P-0 -> offset 1, limit 2.
    assert _ids(page) == ["P-3", "P-2"]
    assert page["total"] == 5
    assert page["limit"] == 2
    assert page["offset"] == 1

    second = client.get("/api/v1/claims/POL-PAGE/analyses?limit=2&offset=3").json()
    assert _ids(second) == ["P-1", "P-0"]
    assert second["total"] == 5


def test_history_rejects_invalid_parameters(client, sqlite_db):
    _, Session = sqlite_db
    _add_claim(Session, "POL-VALID")

    assert client.get("/api/v1/claims/POL-VALID/analyses?limit=0").status_code == 422
    assert client.get("/api/v1/claims/POL-VALID/analyses?limit=101").status_code == 422
    assert client.get("/api/v1/claims/POL-VALID/analyses?offset=-1").status_code == 422
    assert client.get("/api/v1/claims/POL-VALID/analyses?order=sideways").status_code == 422


def test_history_nullable_legacy_fields_serialize(client, sqlite_db):
    _, Session = sqlite_db
    claim_id = _add_claim(Session, "POL-LEGACY")
    _add_analysis(Session, claim_id, "L-1", datetime(2024, 1, 1))

    body = client.get("/api/v1/claims/POL-LEGACY/analyses").json()
    item = body["items"][0]

    assert item["analysis_id"] == "L-1"
    assert item["fraud_probability"] is None
    assert item["predicted_claim_amount"] is None
    assert item["anomaly_score"] is None
    assert item["risk_score"] is None
    assert item["risk_level"] is None
    assert item["recommendation"] is None


# --- Compatibility and read-only guarantees --------------------------------

def test_full_analysis_retrieval_still_works(client, sqlite_db, monkeypatch):
    _stub_analyzer(monkeypatch)
    posted = client.post(ANALYZE_URL, json={"policy_id": "POL-COMPAT"})
    analysis_id = posted.json()["analysis_id"]

    body = client.get(f"/api/v1/analyses/{analysis_id}").json()

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
    assert body["claim_id"] == "POL-COMPAT"


def test_read_endpoints_do_not_invoke_ml_or_modify_data(client, sqlite_db, monkeypatch):
    _, Session = sqlite_db
    claim_id = _add_claim(Session, "POL-READONLY")
    _add_analysis(Session, claim_id, "R-1", datetime(2024, 1, 1), risk_score=1.0)

    calls = []

    def exploding_analyze(data):
        calls.append(data)
        raise AssertionError("ML analyzer must not run during retrieval")

    monkeypatch.setattr(claims_router.analyzer, "analyze", exploding_analyze)

    assert client.get("/api/v1/claims/POL-READONLY").status_code == 200
    assert client.get("/api/v1/claims/POL-READONLY/analyses").status_code == 200
    assert client.get("/api/v1/analyses/R-1").status_code == 200

    assert calls == []
    assert _count(Session, models.Claim) == 1
    assert _count(Session, models.ClaimAnalysis) == 1


def _count(Session, model):
    with Session() as session:
        return session.query(model).count()
