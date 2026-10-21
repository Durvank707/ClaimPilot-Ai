"""Atomic persistence and failure-handling tests for POST /api/v1/claims/analyze.

These tests exercise the real SQLAlchemy persistence path against a temporary
file-based SQLite database (not ``:memory:``) so that transaction state is
preserved across sessions and across separate HTTP requests. The ML analyzer is
stubbed with a canned result so the tests stay focused on persistence.
"""
import copy
import logging
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from backend.main import app
from backend.db import database, models, repository
from backend.routers import claims as claims_router
from backend.schemas import ClaimResponse


# A minimal but realistically shaped analysis result, matching the nested
# structure the real ClaimAnalyzer returns.
ANALYSIS_RESULT = {
    "claim_id": None,
    "fraud": {"probability": 0.13},
    "severity": {"predicted_claim_amount": 11148.6},
    "anomaly": {"score": -0.0243},
    "risk": {"score": 19.59, "level": "LOW"},
    "explanation": {"risk": {"summary": "Stubbed explanation."}},
    "decision": {
        "recommendation": "ROUTINE_REVIEW",
        "priority": "LOW",
        "human_decision_required": True,
        "triggered_rules": [],
    },
}

ANALYZE_URL = "/api/v1/claims/analyze"
# Every top-level field of the response contract (Step 1 fields + the Step 2
# persistence-status fields).
RESPONSE_FIELDS = {
    "claim_id",
    "fraud",
    "severity",
    "anomaly",
    "risk",
    "explanation",
    "decision",
    "analysis_id",
    "persisted",
}


@pytest.fixture
def sqlite_db(tmp_path):
    """A temp file-based SQLite database wired into the app via dependency override."""
    db_path = tmp_path / "test_persistence.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    models.Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[database.get_db] = override_get_db
    try:
        yield engine, TestingSession
    finally:
        app.dependency_overrides.pop(database.get_db, None)
        engine.dispose()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def fake_analyze(monkeypatch):
    """Replace the real analyzer with a canned result to isolate persistence."""

    def fake(data):
        result = copy.deepcopy(ANALYSIS_RESULT)
        result["claim_id"] = data.get("policy_id")
        return result

    monkeypatch.setattr(claims_router.analyzer, "analyze", fake)


def _count(Session, model):
    with Session() as session:
        return session.query(model).count()


def test_successful_persistence_stores_claim_and_analysis(client, sqlite_db, fake_analyze):
    _, Session = sqlite_db

    response = client.post(
        ANALYZE_URL,
        json={"policy_id": "POL-1", "claim_amount": 5000, "incident_type": "Parked Car"},
    )

    assert response.status_code == 200
    # Existing response contract is unchanged (plus the two new status fields).
    assert set(response.json().keys()) == RESPONSE_FIELDS
    body = response.json()
    assert body["claim_id"] == "POL-1"
    assert body["persisted"] is True
    assert body["analysis_id"] is not None

    assert _count(Session, models.Claim) == 1
    assert _count(Session, models.ClaimAnalysis) == 1

    with Session() as session:
        claim = session.query(models.Claim).one()
        analysis = session.query(models.ClaimAnalysis).one()
        assert claim.claim_id == "POL-1"
        assert analysis.claim_id_fk == claim.id
        assert analysis.risk_level == "LOW"
        # The returned identifier is the one actually stored.
        assert body["analysis_id"] == analysis.analysis_id


def test_analysis_failure_rolls_back_new_claim(client, sqlite_db, monkeypatch, caplog):
    _, Session = sqlite_db

    def failing_create_analysis(db, claim_id_fk, res):
        # Perform a real insert first so this exercises actual DB rollback,
        # not just an in-Python exception.
        db.add(models.ClaimAnalysis(analysis_id=str(uuid.uuid4()), claim_id_fk=claim_id_fk))
        db.flush()
        raise SQLAlchemyError("simulated analysis insert failure")

    monkeypatch.setattr(repository, "create_analysis", failing_create_analysis)

    with caplog.at_level(logging.ERROR, logger="backend.routers.claims"):
        response = client.post(ANALYZE_URL, json={"policy_id": "POL-FAIL"})

    # Graceful degradation: the analysis result is still returned.
    assert response.status_code == 200
    assert set(response.json().keys()) == RESPONSE_FIELDS
    body = response.json()
    assert body["persisted"] is False
    assert body["analysis_id"] is None
    # The ML result is preserved (this test uses the real analyzer).
    assert "probability" in body["fraud"]
    assert body["decision"]["human_decision_required"] is True

    # The whole transaction rolled back: no orphan claim, no analysis.
    assert _count(Session, models.Claim) == 0
    assert _count(Session, models.ClaimAnalysis) == 0


def test_failure_is_logged(client, sqlite_db, monkeypatch, caplog):
    def failing_create_analysis(db, claim_id_fk, res):
        raise SQLAlchemyError("simulated failure for logging")

    monkeypatch.setattr(repository, "create_analysis", failing_create_analysis)

    with caplog.at_level(logging.ERROR, logger="backend.routers.claims"):
        client.post(ANALYZE_URL, json={"policy_id": "POL-LOG"})

    records = [r for r in caplog.records if r.name == "backend.routers.claims"]
    assert records, "expected a persistence failure to be logged"
    assert any(r.levelno >= logging.ERROR for r in records)
    assert any("Failed to persist" in r.getMessage() for r in records)
    # The logged exception carries the underlying error detail server-side.
    assert any(r.exc_info is not None for r in records)


def test_existing_claim_is_reused_and_analysis_added(client, sqlite_db, fake_analyze):
    _, Session = sqlite_db

    first = client.post(ANALYZE_URL, json={"policy_id": "POL-DUP"})
    second = client.post(ANALYZE_URL, json={"policy_id": "POL-DUP"})

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["persisted"] is True
    assert second.json()["persisted"] is True
    assert first.json()["analysis_id"] != second.json()["analysis_id"]

    # No duplicate claim; a new analysis is persisted each time.
    assert _count(Session, models.Claim) == 1
    assert _count(Session, models.ClaimAnalysis) == 2

    with Session() as session:
        claim = session.query(models.Claim).one()
        stored_ids = {
            a.analysis_id for a in session.query(models.ClaimAnalysis).all()
        }
        fks = {a.claim_id_fk for a in session.query(models.ClaimAnalysis).all()}
        assert fks == {claim.id}
        # Every returned identifier corresponds to a stored analysis.
        assert {first.json()["analysis_id"], second.json()["analysis_id"]} == stored_ids


def test_repository_operations_flush_only_and_roll_back(sqlite_db):
    """Directly verify flush-only semantics: a rollback leaves no rows behind."""
    _, Session = sqlite_db

    with Session() as session:
        claim = repository.get_or_create_claim(session, {"policy_id": "POL-ROLLBACK"})
        repository.create_analysis(session, claim.id, ANALYSIS_RESULT)
        # Both rows are visible inside the open transaction...
        assert session.query(models.Claim).count() == 1
        assert session.query(models.ClaimAnalysis).count() == 1
        session.rollback()

    # ...but nothing was committed, so a fresh session sees no rows.
    with Session() as session:
        assert session.query(models.Claim).count() == 0
        assert session.query(models.ClaimAnalysis).count() == 0


def test_get_db_closes_session(monkeypatch):
    """The get_db dependency always closes the session, on success and failure."""

    class DummySession:
        def __init__(self):
            self.closed = False

        def close(self):
            self.closed = True

    dummy = DummySession()
    monkeypatch.setattr(database, "SessionLocal", lambda: dummy)

    # Normal completion of the dependency.
    generator = database.get_db()
    assert next(generator) is dummy
    with pytest.raises(StopIteration):
        next(generator)
    assert dummy.closed is True

    # Failure inside the request body still triggers cleanup.
    dummy2 = DummySession()
    monkeypatch.setattr(database, "SessionLocal", lambda: dummy2)
    generator2 = database.get_db()
    assert next(generator2) is dummy2
    generator2.close()
    assert dummy2.closed is True


def test_claim_response_defaults_for_new_fields():
    """The new fields are optional and default to 'not persisted'."""
    model = ClaimResponse(
        fraud={}, severity={}, anomaly={}, risk={}, explanation={}, decision={}
    )
    assert model.analysis_id is None
    assert model.persisted is False


def test_ml_analysis_failure_is_not_reported_as_success(sqlite_db, monkeypatch):
    _, Session = sqlite_db

    def failing_analyze(data):
        raise ValueError("simulated model failure")

    monkeypatch.setattr(claims_router.analyzer, "analyze", failing_analyze)

    # Do not let the test client re-raise; we want to observe the HTTP status.
    failing_client = TestClient(app, raise_server_exceptions=False)
    response = failing_client.post(ANALYZE_URL, json={"policy_id": "POL-MLFAIL"})

    # A model failure is an error, never a "successful, saved" response.
    assert response.status_code >= 500
    assert _count(Session, models.Claim) == 0
    assert _count(Session, models.ClaimAnalysis) == 0


def test_commit_failure_rolls_back_and_reports_not_persisted(
    client, sqlite_db, fake_analyze, monkeypatch, caplog
):
    """A failure at the commit boundary rolls back and never reports success.

    The claim and analysis are flushed (real rows inside the open transaction)
    and then ``commit`` fails; nothing may be left behind and the response must
    report ``persisted=False`` with no ``analysis_id``.
    """
    from sqlalchemy.orm import Session as SASession

    _, Session = sqlite_db

    def failing_commit(self):
        raise SQLAlchemyError("simulated commit failure")

    monkeypatch.setattr(SASession, "commit", failing_commit)

    with caplog.at_level(logging.ERROR, logger="backend.routers.claims"):
        response = client.post(ANALYZE_URL, json={"policy_id": "POL-COMMITFAIL"})

    assert response.status_code == 200
    assert set(response.json().keys()) == RESPONSE_FIELDS
    body = response.json()
    assert body["persisted"] is False
    assert body["analysis_id"] is None

    # Nothing was committed: no orphan claim or analysis.
    assert _count(Session, models.Claim) == 0
    assert _count(Session, models.ClaimAnalysis) == 0
