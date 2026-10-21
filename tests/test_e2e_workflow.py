"""End-to-end backend workflow tests across the real HTTP endpoints.

Unlike ``test_dashboard.py`` (which seeds rows directly through the SQLAlchemy
models), this module drives the *real* API surface in sequence so the
cross-layer invariants are exercised end to end:

    POST /api/v1/claims/analyze
    GET  /api/v1/dashboard/summary
    GET  /api/v1/dashboard/review-queue
    POST /api/v1/analyses/{analysis_id}/reviews
    GET  /api/v1/analyses/{analysis_id}/reviews
    GET  /api/v1/analyses/{analysis_id}

The ML analyzer is replaced with a deterministic stub so no model binaries are
loaded and no inference runs. Data lives in the isolated temporary file-based
SQLite fixtures from ``conftest.py``; no real database is ever touched.

These are in-process HTTP integration tests (FastAPI ``TestClient``), not
browser-level E2E tests.
"""
import copy

import pytest

from backend.routers import claims as claims_router

ANALYZE_URL = "/api/v1/claims/analyze"
SUMMARY_URL = "/api/v1/dashboard/summary"
QUEUE_URL = "/api/v1/dashboard/review-queue"
ANALYSIS_URL = "/api/v1/analyses/{analysis_id}"
REVIEWS_URL = "/api/v1/analyses/{analysis_id}/reviews"

# A deterministic stub matching the shape the real analyzer returns.
STORED_RESULT = {
    "claim_id": None,
    "fraud": {"probability": 0.62},
    "severity": {"predicted_claim_amount": 9000.0},
    "anomaly": {"score": 0.18},
    "risk": {"score": 71.5, "level": "HIGH"},
    "explanation": {"risk": {"summary": "stubbed explanation"}},
    "decision": {
        "recommendation": "ENHANCED_REVIEW",
        "priority": "HIGH",
        "human_decision_required": True,
        "triggered_rules": [],
    },
}

RISK_KEYS = ("LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN")
OUTCOME_KEYS = ("APPROVED", "REJECTED", "NEEDS_MORE_INFO", "ESCALATED", "UNKNOWN")


@pytest.fixture
def stub_analyzer(monkeypatch):
    """Deterministic analyzer stub: no ML inference, no model binaries."""

    def fake(data):
        result = copy.deepcopy(STORED_RESULT)
        result["claim_id"] = data.get("policy_id")
        return result

    monkeypatch.setattr(claims_router.analyzer, "analyze", fake)
    return fake


def _analyze(client, policy_id, **fields):
    """Submit a claim through the real endpoint and return its analysis_id."""
    payload = {"policy_id": policy_id, "claim_amount": 9000, **fields}
    response = client.post(ANALYZE_URL, json=payload)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["persisted"] is True
    assert body["analysis_id"]
    return body["analysis_id"]


def _summary(client, **params):
    response = client.get(SUMMARY_URL, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _queue(client, **params):
    response = client.get(QUEUE_URL, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _review(client, analysis_id, outcome, **fields):
    response = client.post(
        REVIEWS_URL.format(analysis_id=analysis_id),
        json={"final_decision": outcome, **fields},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _queue_ids(body):
    return {item["analysis_id"] for item in body["items"]}


# --- Full happy-path chain -------------------------------------------------


def test_full_analyze_review_dashboard_chain(client, sqlite_db, stub_analyzer):
    """Analyze -> summary -> queue -> review -> summary -> queue, end to end."""
    analysis_id = _analyze(client, "POL-E2E", incident_type="Collision")

    # 1. The analysis appears in the dashboard summary and awaiting queue.
    summary = _summary(client)
    assert summary["totals"]["analyses"] == 1
    assert summary["totals"]["claims"] == 1
    assert summary["totals"]["reviews"] == 0
    assert summary["analyses_awaiting_review"] == 1
    assert summary["analyses_with_reviews"] == 0
    assert summary["risk_distribution"]["HIGH"] == 1
    # The stub's risk level must be one the dashboard actually buckets.
    assert summary["risk_review_status"]["HIGH"] == {
        "total": 1,
        "awaiting_review": 1,
        "reviewed": 0,
    }
    assert summary["oldest_awaiting_analyzed_at"] is not None

    awaiting = _queue(client, scope="awaiting")
    assert awaiting["total"] == 1
    assert _queue_ids(awaiting) == {analysis_id}
    (item,) = awaiting["items"]
    assert item["review_count"] == 0
    assert item["latest_review_outcome"] is None
    assert item["incident_type"] == "Collision"
    assert item["claim_amount"] == 9000

    # 2. Submit a human review through the real endpoint.
    saved = _review(
        client,
        analysis_id,
        "APPROVED",
        reviewer_id="OFFICER-1",
        comments="Documents verified.",
    )
    assert saved["final_decision"] == "APPROVED"
    assert saved["analysis_id"] == analysis_id
    assert saved["claim_id"] == "POL-E2E"

    # 3. Summary counts and per-risk reviewed/awaiting counts update correctly.
    after = _summary(client)
    # Review *records* vs reviewed *analyses* stay distinct.
    assert after["totals"]["reviews"] == 1
    assert after["analyses_with_reviews"] == 1
    assert after["analyses_awaiting_review"] == 0
    assert after["review_outcomes"]["APPROVED"] == 1
    assert after["latest_review_outcomes"]["APPROVED"] == 1
    assert after["risk_review_status"]["HIGH"] == {
        "total": 1,
        "awaiting_review": 0,
        "reviewed": 1,
    }
    assert after["oldest_awaiting_analyzed_at"] is None
    recent_reviews = after["recent_reviews"]
    assert len(recent_reviews) == 1
    assert recent_reviews[0]["analysis_id"] == analysis_id
    assert recent_reviews[0]["final_decision"] == "APPROVED"

    # 4. It disappears from `awaiting` but remains in `all`.
    assert _queue(client, scope="awaiting")["total"] == 0
    assert _queue_ids(_queue(client, scope="awaiting")) == set()
    everything = _queue(client, scope="all")
    assert everything["total"] == 1
    assert _queue_ids(everything) == {analysis_id}
    (reviewed_item,) = everything["items"]
    assert reviewed_item["review_count"] == 1
    assert reviewed_item["latest_review_outcome"] == "APPROVED"

    # 5. The saved review and the analysis details can be retrieved.
    listed = client.get(REVIEWS_URL.format(analysis_id=analysis_id))
    assert listed.status_code == 200
    assert [r["final_decision"] for r in listed.json()] == ["APPROVED"]

    detail = client.get(ANALYSIS_URL.format(analysis_id=analysis_id))
    assert detail.status_code == 200
    detail_body = detail.json()
    assert detail_body["analysis_id"] == analysis_id
    assert detail_body["claim_id"] == "POL-E2E"

    # 6. Human-in-the-loop is preserved: every analysis requires a human decision.
    assert detail_body["decision"]["human_decision_required"] is True


# --- Scopes and the human-in-the-loop invariant ----------------------------


@pytest.mark.parametrize("outcome", ["NEEDS_MORE_INFO", "ESCALATED"])
def test_outcome_keeps_analysis_open(
    client, sqlite_db, stub_analyzer, outcome
):
    """A needs-info/escalated outcome leaves the analysis in the `open` scope."""
    analysis_id = _analyze(client, f"POL-OPEN-{outcome}")
    _review(client, analysis_id, outcome, reviewer_id="OFFICER-2")

    open_queue = _queue(client, scope="open")
    assert _queue_ids(open_queue) == {analysis_id}
    # It is no longer awaiting a first review, but it still needs attention.
    assert _queue(client, scope="awaiting")["total"] == 0
    assert open_queue["items"][0]["latest_review_outcome"] == outcome


def test_approved_review_removes_analysis_from_open(
    client, sqlite_db, stub_analyzer
):
    """A later APPROVED outcome removes the analysis from the `open` scope."""
    analysis_id = _analyze(client, "POL-RESOLVE")
    _review(client, analysis_id, "ESCALATED", reviewer_id="OFFICER-3")
    assert _queue_ids(_queue(client, scope="open")) == {analysis_id}

    # The reviewer records a subsequent, resolving decision.
    _review(client, analysis_id, "APPROVED", reviewer_id="OFFICER-3")

    assert _queue(client, scope="open")["total"] == 0
    # Both review records are still stored; the newest outcome governs `open`.
    assert _summary(client)["totals"]["reviews"] == 2
    assert _summary(client)["latest_review_outcomes"]["APPROVED"] == 1
    assert _summary(client)["latest_review_outcomes"]["ESCALATED"] == 0


# --- Record counts vs analysis counts --------------------------------------


def test_multiple_reviews_keep_record_and_analysis_counts_distinct(
    client, sqlite_db, stub_analyzer
):
    """Review *records* and reviewed *analyses* are never conflated."""
    analysis_id = _analyze(client, "POL-MULTI")
    _review(client, analysis_id, "ESCALATED", reviewer_id="R1")
    _review(client, analysis_id, "NEEDS_MORE_INFO", reviewer_id="R2")

    summary = _summary(client)
    assert summary["totals"]["reviews"] == 2  # records
    assert summary["analyses_with_reviews"] == 1  # analyses
    assert summary["analyses_awaiting_review"] == 0
    assert summary["risk_review_status"]["HIGH"]["reviewed"] == 1
    assert summary["review_outcomes"]["ESCALATED"] == 1
    assert summary["review_outcomes"]["NEEDS_MORE_INFO"] == 1
    # Only the most recently recorded outcome counts for the analysis.
    assert summary["latest_review_outcomes"]["NEEDS_MORE_INFO"] == 1
    assert summary["latest_review_outcomes"]["ESCALATED"] == 0

    all_queue = _queue(client, scope="all")
    (item,) = all_queue["items"]
    assert item["review_count"] == 2
    assert item["latest_review_outcome"] == "NEEDS_MORE_INFO"


# --- Reads never infer and never mutate ------------------------------------


def test_reads_never_invoke_ml_and_never_mutate_counts(
    client, sqlite_db, stub_analyzer, monkeypatch
):
    """Dashboard/queue/review/analysis reads are pure: no ML, no writes."""
    analysis_id = _analyze(client, "POL-READONLY")
    _review(client, analysis_id, "REJECTED", reviewer_id="OFFICER-4")

    def exploding_analyze(data):
        raise AssertionError("ML analyzer must not run during a read")

    monkeypatch.setattr(claims_router.analyzer, "analyze", exploding_analyze)

    before = _summary(client)["totals"]

    assert client.get(SUMMARY_URL).status_code == 200
    assert client.get(QUEUE_URL, params={"scope": "all"}).status_code == 200
    assert client.get(ANALYSIS_URL.format(analysis_id=analysis_id)).status_code == 200
    assert client.get(REVIEWS_URL.format(analysis_id=analysis_id)).status_code == 200

    after = _summary(client)["totals"]
    assert after == before


# --- The queue never exposes internal keys ---------------------------------


def test_queue_and_summary_do_not_expose_internal_keys(
    client, sqlite_db, stub_analyzer
):
    analysis_id = _analyze(client, "POL-KEYS")
    _review(client, analysis_id, "APPROVED", reviewer_id="OFFICER-5")

    summary = _summary(client)
    for row in summary["recent_analyses"]:
        assert "id" not in row
        assert "claim_id_fk" not in row
    for row in summary["recent_reviews"]:
        assert "id" not in row
        assert "analysis_id_fk" not in row

    (item,) = _queue(client, scope="all")["items"]
    assert "id" not in item
    assert "analysis_id_fk" not in item
    assert "claim_id_fk" not in item
