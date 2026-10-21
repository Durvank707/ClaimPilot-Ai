"""Public API contract tests for the read endpoints.

These pin the *public* JSON shape of each read endpoint: the fields the
frontend parsers require must be present, and internal persistence details
(integer primary keys, foreign-key columns) must never leak.

The assertions intentionally target the contract, not implementation details:

- required public field names are present,
- nullable fields may be ``null`` and are never dropped,
- no internal database identifier (``id``, ``*_fk``) appears anywhere.

Data is inserted through the real endpoints where practical, and the ML
analyzer is stubbed so no inference runs. The isolated temporary file-based
SQLite fixtures from ``conftest.py`` are used throughout.
"""
import copy
import uuid

import pytest

from backend.db import models
from backend.routers import claims as claims_router

ANALYZE_URL = "/api/v1/claims/analyze"
SUMMARY_URL = "/api/v1/dashboard/summary"
QUEUE_URL = "/api/v1/dashboard/review-queue"
ANALYSIS_URL = "/api/v1/analyses/{analysis_id}"
REVIEWS_URL = "/api/v1/analyses/{analysis_id}/reviews"
HISTORY_URL = "/api/v1/claims/{claim_id}/analyses"

STORED_RESULT = {
    "claim_id": None,
    "fraud": {"probability": 0.13},
    "severity": {"predicted_claim_amount": 11148.6},
    "anomaly": {"score": -0.0243},
    "risk": {"score": 19.59, "level": "LOW"},
    "explanation": {"risk": {"summary": "stub"}},
    "decision": {
        "recommendation": "ROUTINE_REVIEW",
        "priority": "LOW",
        "human_decision_required": True,
        "triggered_rules": [],
    },
}

# Exact public field sets, taken from backend/db/schemas.py.
SUMMARY_KEYS = {
    "totals",
    "high_critical_analyses",
    "analyses_with_reviews",
    "analyses_awaiting_review",
    "risk_distribution",
    "review_outcomes",
    "latest_review_outcomes",
    "recent_analyses",
    "risk_review_status",
    "recent_reviews",
    "oldest_awaiting_analyzed_at",
}
TOTALS_KEYS = {"claims", "analyses", "reviews"}
RISK_STATUS_ROW_KEYS = {"total", "awaiting_review", "reviewed"}
RECENT_ANALYSIS_KEYS = {
    "analysis_id",
    "claim_id",
    "analyzed_at",
    "fraud_probability",
    "predicted_claim_amount",
    "anomaly_score",
    "risk_score",
    "risk_level",
    "recommendation",
}
RECENT_REVIEW_KEYS = {
    "review_id",
    "final_decision",
    "reviewer_id",
    "reviewed_at",
    "analysis_id",
    "claim_id",
    "risk_level",
}
QUEUE_KEYS = {
    "items",
    "total",
    "limit",
    "offset",
}
QUEUE_ITEM_KEYS = {
    "analysis_id",
    "claim_id",
    "analyzed_at",
    "risk_score",
    "risk_level",
    "fraud_probability",
    "predicted_claim_amount",
    "anomaly_score",
    "recommendation",
    "review_count",
    "latest_review_outcome",
    "latest_reviewed_at",
    "incident_type",
    "claim_amount",
}
HISTORY_PAGE_KEYS = {"items", "total", "limit", "offset"}
HISTORY_ITEM_KEYS = {
    "analysis_id",
    "analyzed_at",
    "fraud_probability",
    "predicted_claim_amount",
    "anomaly_score",
    "risk_score",
    "risk_level",
    "recommendation",
}
ANALYSIS_KEYS = {
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
REVIEW_KEYS = {
    "review_id",
    "final_decision",
    "reviewer_id",
    "comments",
    "reviewed_at",
    "analysis_id",
    "claim_id",
}
RISK_LEVEL_KEYS = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
OUTCOME_KEYS = {"APPROVED", "REJECTED", "NEEDS_MORE_INFO", "ESCALATED", "UNKNOWN"}

# Any field whose name matches this is an internal persistence detail that must
# never be exposed by a public read endpoint.
_INTERNAL_FIELD = lambda key: key == "id" or key.endswith("_fk")


@pytest.fixture
def stub_analyzer(monkeypatch):
    def fake(data):
        result = copy.deepcopy(STORED_RESULT)
        result["claim_id"] = data.get("policy_id")
        return result

    monkeypatch.setattr(claims_router.analyzer, "analyze", fake)


def _assert_no_internal_keys(node):
    """Recursively assert no internal PK/FK field appears in a payload."""
    if isinstance(node, dict):
        for key, value in node.items():
            assert not _INTERNAL_FIELD(key), f"leaked internal field: {key}"
            _assert_no_internal_keys(value)
    elif isinstance(node, list):
        for item in node:
            _assert_no_internal_keys(item)


def _seed(client, stub_analyzer, policy_id="POL-CONTRACT"):
    """Store one analysis and one review through the real endpoints."""
    response = client.post(ANALYZE_URL, json={"policy_id": policy_id})
    assert response.status_code == 200
    analysis_id = response.json()["analysis_id"]
    saved = client.post(
        REVIEWS_URL.format(analysis_id=analysis_id),
        json={"final_decision": "APPROVED", "reviewer_id": "OFFICER-1"},
    )
    assert saved.status_code == 201
    return analysis_id, saved.json()


# --- Dashboard summary -----------------------------------------------------


def test_dashboard_summary_public_contract(client, sqlite_db, stub_analyzer):
    _seed(client, stub_analyzer)

    body = client.get(SUMMARY_URL).json()

    assert set(body.keys()) == SUMMARY_KEYS
    assert set(body["totals"].keys()) == TOTALS_KEYS
    assert set(body["risk_distribution"].keys()) == RISK_LEVEL_KEYS | {"UNKNOWN"}
    assert set(body["review_outcomes"].keys()) == OUTCOME_KEYS
    assert set(body["latest_review_outcomes"].keys()) == OUTCOME_KEYS
    assert set(body["risk_review_status"].keys()) == RISK_LEVEL_KEYS | {"UNKNOWN"}
    for row in body["risk_review_status"].values():
        assert set(row.keys()) == RISK_STATUS_ROW_KEYS
    for row in body["recent_analyses"]:
        assert set(row.keys()) == RECENT_ANALYSIS_KEYS
    for row in body["recent_reviews"]:
        assert set(row.keys()) == RECENT_REVIEW_KEYS

    _assert_no_internal_keys(body)


def test_dashboard_summary_empty_contract_and_nullability(client, sqlite_db):
    body = client.get(SUMMARY_URL).json()

    assert set(body.keys()) == SUMMARY_KEYS
    assert body["totals"] == {"claims": 0, "analyses": 0, "reviews": 0}
    assert body["recent_analyses"] == []
    assert body["recent_reviews"] == []
    # Nullable field is present and null rather than omitted.
    assert body["oldest_awaiting_analyzed_at"] is None


# --- Dashboard review queue ------------------------------------------------


def test_review_queue_public_contract_and_nullability(
    client, sqlite_db, stub_analyzer
):
    analysis_id, _ = _seed(client, stub_analyzer)

    body = client.get(QUEUE_URL, params={"scope": "all"}).json()

    assert set(body.keys()) == QUEUE_KEYS
    _assert_no_internal_keys(body)
    (item,) = body["items"]
    assert set(item.keys()) == QUEUE_ITEM_KEYS
    assert item["analysis_id"] == analysis_id
    assert item["review_count"] == 1
    assert item["latest_review_outcome"] == "APPROVED"
    # Claim context fields are present; amount is null when never supplied.
    assert "incident_type" in item
    assert item["claim_amount"] is None


def test_review_queue_empty_contract_and_awaiting_nullability(
    client, sqlite_db, stub_analyzer
):
    # An awaiting (never-reviewed) analysis: review fields are null, not absent.
    client.post(ANALYZE_URL, json={"policy_id": "POL-AWAIT"})
    body = client.get(QUEUE_URL, params={"scope": "awaiting"}).json()

    assert set(body.keys()) == QUEUE_KEYS
    assert body["total"] == 1
    assert body["offset"] == 0
    (item,) = body["items"]
    assert set(item.keys()) == QUEUE_ITEM_KEYS
    assert item["review_count"] == 0
    assert item["latest_review_outcome"] is None
    assert item["latest_reviewed_at"] is None

    empty = client.get(QUEUE_URL, params={"scope": "all", "offset": 99}).json()
    assert empty["items"] == []
    assert "items" in empty


# --- Claim analysis history ------------------------------------------------


def test_claim_history_public_contract(client, sqlite_db, stub_analyzer):
    client.post(ANALYZE_URL, json={"policy_id": "POL-HIST"})

    body = client.get(HISTORY_URL.format(claim_id="POL-HIST")).json()

    assert set(body.keys()) == HISTORY_PAGE_KEYS
    _assert_no_internal_keys(body)
    (item,) = body["items"]
    assert set(item.keys()) == HISTORY_ITEM_KEYS
    # The lightweight summary deliberately omits the heavier payloads.
    assert "explanation" not in item
    assert "decision" not in item


# --- Saved analysis detail -------------------------------------------------


def test_analysis_detail_public_contract(client, sqlite_db, stub_analyzer):
    analysis_id, _ = _seed(client, stub_analyzer)

    body = client.get(ANALYSIS_URL.format(analysis_id=analysis_id)).json()

    assert set(body.keys()) == ANALYSIS_KEYS
    _assert_no_internal_keys(body)
    assert set(body["fraud"].keys()) == {"probability"}
    assert set(body["severity"].keys()) == {"predicted_claim_amount"}
    assert set(body["anomaly"].keys()) == {"score"}
    assert set(body["risk"].keys()) == {"score", "level", "components"}
    assert body["analysis_id"] == analysis_id


def test_analysis_detail_nullable_payloads(client, sqlite_db):
    """A stored analysis without explanation/decision returns null, not a 404."""
    analysis_id = str(uuid.uuid4())
    _, Session = sqlite_db
    with Session() as session:
        claim = models.Claim(claim_id="POL-NULLABLE")
        session.add(claim)
        session.flush()
        session.add(
            models.ClaimAnalysis(
                analysis_id=analysis_id,
                claim_id_fk=claim.id,
                explanation=None,
                recommendation=None,
            )
        )
        session.commit()

    body = client.get(ANALYSIS_URL.format(analysis_id=analysis_id)).json()

    assert set(body.keys()) == ANALYSIS_KEYS
    assert body["explanation"] is None
    assert body["decision"] is None


# --- Human review list -----------------------------------------------------


def test_review_list_public_contract_and_nullability(
    client, sqlite_db, stub_analyzer
):
    analysis_id, _ = _seed(client, stub_analyzer)

    body = client.get(REVIEWS_URL.format(analysis_id=analysis_id)).json()

    assert isinstance(body, list)
    _assert_no_internal_keys(body)
    (review,) = body
    assert set(review.keys()) == REVIEW_KEYS
    assert review["review_id"]
    assert review["final_decision"] == "APPROVED"
    assert review["analysis_id"] == analysis_id
    assert review["claim_id"] == "POL-CONTRACT"
    # Optional fields are present (null) rather than omitted.
    assert "comments" in review
    assert review["comments"] is None


def test_review_list_empty_contract(client, sqlite_db, stub_analyzer):
    response = client.post(ANALYZE_URL, json={"policy_id": "POL-NOREV"})
    analysis_id = response.json()["analysis_id"]

    body = client.get(REVIEWS_URL.format(analysis_id=analysis_id)).json()
    assert body == []
