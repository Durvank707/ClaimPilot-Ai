"""Tests for the human review workflow.

Endpoints under test:
    POST /api/v1/analyses/{analysis_id}/reviews
    GET  /api/v1/analyses/{analysis_id}/reviews

The platform records only what a human reviewer explicitly submits. These tests
use the shared temporary file-based SQLite setup from ``conftest.py`` and never
contact a real database or run migrations.
"""
import copy

import pytest
from sqlalchemy.exc import SQLAlchemyError

from backend.db import models
from backend.db.schemas import REVIEW_OUTCOMES
from backend.routers import claims as claims_router


STORED_RESULT = {
    "claim_id": None,
    "fraud": {"probability": 0.13},
    "severity": {"predicted_claim_amount": 11148.6},
    "anomaly": {"score": -0.0243},
    "risk": {"score": 19.59, "level": "LOW"},
    "explanation": {"risk": {"summary": "stored"}},
    "decision": {"recommendation": "ROUTINE_REVIEW", "human_decision_required": True},
}

ANALYZE_URL = "/api/v1/claims/analyze"
REVIEWS_URL = "/api/v1/analyses/{analysis_id}/reviews"

REVIEW_FIELDS = {
    "review_id",
    "final_decision",
    "reviewer_id",
    "comments",
    "reviewed_at",
    "analysis_id",
    "claim_id",
}


def _store_analysis(client, monkeypatch, policy_id="POL-REVIEW"):
    """Submit a claim with a stubbed analyzer and return its analysis_id."""

    def fake(data):
        result = copy.deepcopy(STORED_RESULT)
        result["claim_id"] = data.get("policy_id")
        return result

    monkeypatch.setattr(claims_router.analyzer, "analyze", fake)
    response = client.post(ANALYZE_URL, json={"policy_id": policy_id})
    assert response.status_code == 200
    assert response.json()["persisted"] is True
    return response.json()["analysis_id"]


def test_create_review_persists_and_returns_saved_review(client, sqlite_db, monkeypatch):
    analysis_id = _store_analysis(client, monkeypatch)
    _, Session = sqlite_db

    response = client.post(
        REVIEWS_URL.format(analysis_id=analysis_id),
        json={
            "final_decision": "APPROVED",
            "reviewer_id": "OFFICER-7",
            "comments": "Documents verified.",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert set(body.keys()) == REVIEW_FIELDS
    # The internal integer primary key is never exposed.
    assert "id" not in body
    assert body["final_decision"] == "APPROVED"
    assert body["reviewer_id"] == "OFFICER-7"
    assert body["comments"] == "Documents verified."
    assert body["analysis_id"] == analysis_id
    assert body["claim_id"] == "POL-REVIEW"
    assert body["review_id"]
    assert body["reviewed_at"]

    with Session() as session:
        stored = session.query(models.HumanReview).one()
    assert stored.review_id == body["review_id"]
    assert stored.final_decision == "APPROVED"


@pytest.mark.parametrize("outcome", REVIEW_OUTCOMES)
def test_all_four_outcomes_are_accepted(client, sqlite_db, monkeypatch, outcome):
    analysis_id = _store_analysis(client, monkeypatch, policy_id=f"POL-{outcome}")

    response = client.post(
        REVIEWS_URL.format(analysis_id=analysis_id),
        json={"final_decision": outcome, "reviewer_id": "OFFICER-1"},
    )

    assert response.status_code == 201
    assert response.json()["final_decision"] == outcome


def test_invalid_outcome_is_rejected_with_422(client, sqlite_db, monkeypatch):
    analysis_id = _store_analysis(client, monkeypatch)

    response = client.post(
        REVIEWS_URL.format(analysis_id=analysis_id),
        json={"final_decision": "MAYBE"},
    )

    assert response.status_code == 422
    _, Session = sqlite_db
    with Session() as session:
        assert session.query(models.HumanReview).count() == 0


def test_missing_outcome_is_rejected_with_422(client, sqlite_db, monkeypatch):
    analysis_id = _store_analysis(client, monkeypatch)

    response = client.post(
        REVIEWS_URL.format(analysis_id=analysis_id),
        json={"reviewer_id": "OFFICER-1"},
    )

    assert response.status_code == 422


def test_unknown_analysis_returns_404_on_create(client, sqlite_db):
    response = client.post(
        REVIEWS_URL.format(analysis_id="does-not-exist"),
        json={"final_decision": "APPROVED"},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Analysis not found"


def test_unknown_analysis_returns_404_on_list(client, sqlite_db):
    response = client.get(REVIEWS_URL.format(analysis_id="does-not-exist"))
    assert response.status_code == 404
    assert response.json()["detail"] == "Analysis not found"


def test_optional_fields_default_to_null(client, sqlite_db, monkeypatch):
    analysis_id = _store_analysis(client, monkeypatch)

    response = client.post(
        REVIEWS_URL.format(analysis_id=analysis_id),
        json={"final_decision": "NEEDS_MORE_INFO"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["reviewer_id"] is None
    assert body["comments"] is None


def test_list_returns_saved_reviews_newest_first(client, sqlite_db, monkeypatch):
    analysis_id = _store_analysis(client, monkeypatch)
    url = REVIEWS_URL.format(analysis_id=analysis_id)

    for outcome in ("APPROVED", "ESCALATED"):
        saved = client.post(url, json={"final_decision": outcome, "reviewer_id": "R"})
        assert saved.status_code == 201

    response = client.get(url)

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 2
    # Newest first: the most recently created review leads.
    assert body[0]["final_decision"] == "ESCALATED"
    assert body[1]["final_decision"] == "APPROVED"
    assert set(body[0].keys()) == REVIEW_FIELDS


def test_list_is_empty_for_analysis_without_reviews(client, sqlite_db, monkeypatch):
    analysis_id = _store_analysis(client, monkeypatch)

    response = client.get(REVIEWS_URL.format(analysis_id=analysis_id))

    assert response.status_code == 200
    assert response.json() == []


def test_review_links_to_analysis_and_claim_rows(client, sqlite_db, monkeypatch):
    analysis_id = _store_analysis(client, monkeypatch, policy_id="POL-LINK")
    _, Session = sqlite_db

    client.post(
        REVIEWS_URL.format(analysis_id=analysis_id),
        json={"final_decision": "REJECTED"},
    )

    with Session() as session:
        analysis = session.query(models.ClaimAnalysis).one()
        claim = session.query(models.Claim).one()
        review = session.query(models.HumanReview).one()
    assert review.analysis_id_fk == analysis.id
    assert review.claim_id_fk == claim.id


def test_persistence_failure_rolls_back_and_reports_error(
    client, sqlite_db, monkeypatch
):
    from sqlalchemy.orm import Session as SASession

    analysis_id = _store_analysis(client, monkeypatch)
    _, Session = sqlite_db

    def failing_commit(self):
        raise SQLAlchemyError("simulated commit failure")

    monkeypatch.setattr(SASession, "commit", failing_commit)

    response = client.post(
        REVIEWS_URL.format(analysis_id=analysis_id),
        json={"final_decision": "APPROVED"},
    )

    # The failure is reported as an error, never as a saved review.
    assert response.status_code == 500
    with Session() as session:
        assert session.query(models.HumanReview).count() == 0


def test_listing_does_not_invoke_the_ml_analyzer(client, sqlite_db, monkeypatch):
    analysis_id = _store_analysis(client, monkeypatch)

    def exploding_analyze(data):
        raise AssertionError("ML analyzer must not be called during review listing")

    monkeypatch.setattr(claims_router.analyzer, "analyze", exploding_analyze)

    response = client.get(REVIEWS_URL.format(analysis_id=analysis_id))

    assert response.status_code == 200


def test_existing_analysis_endpoint_still_works(client, sqlite_db, monkeypatch):
    """The review router must not disturb the existing retrieval contract."""
    analysis_id = _store_analysis(client, monkeypatch)

    response = client.get(f"/api/v1/analyses/{analysis_id}")

    assert response.status_code == 200
    assert response.json()["analysis_id"] == analysis_id
