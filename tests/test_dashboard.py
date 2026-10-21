"""Tests for the dashboard summary endpoint.

Endpoint under test:
    GET /api/v1/dashboard/summary

Data is inserted directly through the SQLAlchemy models so counts, latest-review
selection and ordering can be controlled precisely. The shared temporary
file-based SQLite fixtures from ``conftest.py`` are used; no real database or ML
inference is involved.
"""
import uuid
from datetime import datetime

from sqlalchemy.exc import SQLAlchemyError

from backend.db import models, repository
from backend.routers import claims as claims_router

URL = "/api/v1/dashboard/summary"

RISK_KEYS = ("LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN")
OUTCOME_KEYS = ("APPROVED", "REJECTED", "NEEDS_MORE_INFO", "ESCALATED", "UNKNOWN")

RECENT_KEYS = {
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


def _zeroed(keys):
    return {key: 0 for key in keys}


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
        session.refresh(analysis)
        return analysis.id


def _add_review(Session, analysis_fk, outcome, reviewed_at=None, claim_fk=None, **fields):
    with Session() as session:
        review = models.HumanReview(
            review_id=str(uuid.uuid4()),
            analysis_id_fk=analysis_fk,
            claim_id_fk=claim_fk,
            final_decision=outcome,
            reviewed_at=reviewed_at,
            **fields,
        )
        session.add(review)
        session.commit()
        session.refresh(review)
        return review.id


def _clear_analyzed_at(Session, analysis_fk):
    """Force ``analyzed_at`` to a real SQL NULL.

    The model has a Python-side ``default=datetime.utcnow``, so passing ``None``
    to the constructor still stores a timestamp. Only an UPDATE writes NULL.
    """
    with Session() as session:
        session.query(models.ClaimAnalysis).filter(
            models.ClaimAnalysis.id == analysis_fk
        ).update({"analyzed_at": None})
        session.commit()


# --- Empty database --------------------------------------------------------

def test_empty_database_returns_zeroed_summary(client, sqlite_db):
    response = client.get(URL)

    assert response.status_code == 200
    body = response.json()
    assert body["totals"] == {"claims": 0, "analyses": 0, "reviews": 0}
    assert body["high_critical_analyses"] == 0
    assert body["analyses_with_reviews"] == 0
    assert body["analyses_awaiting_review"] == 0
    assert body["risk_distribution"] == _zeroed(RISK_KEYS)
    assert body["review_outcomes"] == _zeroed(OUTCOME_KEYS)
    assert body["latest_review_outcomes"] == _zeroed(OUTCOME_KEYS)
    assert body["recent_analyses"] == []


# --- Analysis / claim / risk counts ---------------------------------------

def test_claims_and_analyses_are_counted_separately(client, sqlite_db):
    _, Session = sqlite_db
    c1 = _add_claim(Session, "POL-1")
    c2 = _add_claim(Session, "POL-2")
    # Two analyses for one claim: analyses must not be counted as unique claims.
    _add_analysis(Session, c1, "A-1", datetime(2024, 1, 1), risk_level="LOW")
    _add_analysis(Session, c1, "A-2", datetime(2024, 1, 2), risk_level="MEDIUM")
    _add_analysis(Session, c2, "A-3", datetime(2024, 1, 3), risk_level="HIGH")

    body = client.get(URL).json()

    assert body["totals"]["claims"] == 2
    assert body["totals"]["analyses"] == 3


def test_risk_distribution_and_high_critical(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-RISK")
    _add_analysis(Session, c, "R-LOW", datetime(2024, 1, 1), risk_level="LOW")
    _add_analysis(Session, c, "R-MED", datetime(2024, 1, 2), risk_level="MEDIUM")
    _add_analysis(Session, c, "R-HIGH", datetime(2024, 1, 3), risk_level="HIGH")
    _add_analysis(Session, c, "R-CRIT", datetime(2024, 1, 4), risk_level="CRITICAL")
    _add_analysis(Session, c, "R-HIGH2", datetime(2024, 1, 5), risk_level="HIGH")

    body = client.get(URL).json()

    assert body["risk_distribution"] == {
        "LOW": 1,
        "MEDIUM": 1,
        "HIGH": 2,
        "CRITICAL": 1,
        "UNKNOWN": 0,
    }
    assert body["high_critical_analyses"] == 3


def test_risk_level_matching_is_case_insensitive(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-CASE")
    _add_analysis(Session, c, "R-lower", datetime(2024, 1, 1), risk_level="high")

    body = client.get(URL).json()

    assert body["risk_distribution"]["HIGH"] == 1
    assert body["high_critical_analyses"] == 1


def test_null_or_unrecognised_risk_level_is_unknown(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-UNK")
    _add_analysis(Session, c, "R-NULL", datetime(2024, 1, 1), risk_level=None)
    _add_analysis(Session, c, "R-WEIRD", datetime(2024, 1, 2), risk_level="sideways")

    body = client.get(URL).json()

    assert body["risk_distribution"]["UNKNOWN"] == 2
    assert body["high_critical_analyses"] == 0
    assert body["totals"]["analyses"] == 2


# --- Human review counts ---------------------------------------------------

def test_review_records_vs_analyses_with_reviews(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-REV")
    a1 = _add_analysis(Session, c, "A-1", datetime(2024, 1, 1))
    a2 = _add_analysis(Session, c, "A-2", datetime(2024, 1, 2))
    _add_analysis(Session, c, "A-3", datetime(2024, 1, 3))  # no review yet

    # Two reviews for A-1, one for A-2.
    _add_review(Session, a1, "APPROVED", datetime(2024, 2, 1), claim_fk=c)
    _add_review(Session, a1, "REJECTED", datetime(2024, 2, 2), claim_fk=c)
    _add_review(Session, a2, "NEEDS_MORE_INFO", datetime(2024, 2, 3), claim_fk=c)

    body = client.get(URL).json()

    assert body["totals"]["reviews"] == 3
    assert body["review_outcomes"] == {
        "APPROVED": 1,
        "REJECTED": 1,
        "NEEDS_MORE_INFO": 1,
        "ESCALATED": 0,
        "UNKNOWN": 0,
    }
    # 2 of 3 analyses have a review; the third is awaiting one.
    assert body["analyses_with_reviews"] == 2
    assert body["analyses_awaiting_review"] == 1


def test_latest_review_outcome_uses_most_recent_record(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-LATEST")
    a1 = _add_analysis(Session, c, "A-1", datetime(2024, 1, 1))
    a2 = _add_analysis(Session, c, "A-2", datetime(2024, 1, 2))

    # A-1 has two reviews; the later ESCALATED becomes its latest outcome.
    _add_review(Session, a1, "APPROVED", datetime(2024, 2, 1), claim_fk=c)
    _add_review(Session, a1, "ESCALATED", datetime(2024, 2, 2), claim_fk=c)
    _add_review(Session, a2, "APPROVED", datetime(2024, 2, 3), claim_fk=c)

    body = client.get(URL).json()

    assert body["latest_review_outcomes"] == {
        "APPROVED": 1,
        "REJECTED": 0,
        "NEEDS_MORE_INFO": 0,
        "ESCALATED": 1,
        "UNKNOWN": 0,
    }
    # The latest-view total equals the number of analyses that have a review.
    assert sum(body["latest_review_outcomes"].values()) == body["analyses_with_reviews"] == 2


def test_latest_review_tie_breaks_on_most_recently_inserted(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-TIE")
    a1 = _add_analysis(Session, c, "A-1", datetime(2024, 1, 1))
    same = datetime(2024, 2, 1, 12, 0, 0)
    _add_review(Session, a1, "APPROVED", same, claim_fk=c)
    _add_review(Session, a1, "REJECTED", same, claim_fk=c)

    body = client.get(URL).json()

    # Append-only: the most recently inserted review wins.
    assert body["latest_review_outcomes"]["REJECTED"] == 1
    assert body["latest_review_outcomes"]["APPROVED"] == 0


def test_unrecognised_review_outcome_is_unknown(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-BADOUTCOME")
    a1 = _add_analysis(Session, c, "A-1", datetime(2024, 1, 1))
    _add_review(Session, a1, "MAYBE", datetime(2024, 2, 1), claim_fk=c)

    body = client.get(URL).json()

    assert body["review_outcomes"]["UNKNOWN"] == 1
    assert body["latest_review_outcomes"]["UNKNOWN"] == 1


def test_orphan_reviews_do_not_inflate_analyses_with_reviews(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-ORPHAN")
    _add_analysis(Session, c, "A-1", datetime(2024, 1, 1))
    # A review with no analysis cannot be attached to one.
    _add_review(Session, None, "APPROVED", datetime(2024, 2, 1), claim_fk=c)

    body = client.get(URL).json()

    assert body["totals"]["reviews"] == 1
    assert body["analyses_with_reviews"] == 0
    assert body["analyses_awaiting_review"] == 1
    assert sum(body["latest_review_outcomes"].values()) == 0


# --- Recent activity -------------------------------------------------------

def test_recent_activity_ordering_shape_and_limit(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-RECENT")
    for i in range(1, 6):
        _add_analysis(
            Session,
            c,
            f"R-{i}",
            datetime(2024, 3, i),
            risk_level="MEDIUM",
            risk_score=float(i * 10),
            recommendation={"recommendation": "ENHANCED_REVIEW"},
        )

    body = client.get(f"{URL}?recent_limit=3").json()

    assert [a["analysis_id"] for a in body["recent_analyses"]] == ["R-5", "R-4", "R-3"]
    item = body["recent_analyses"][0]
    assert set(item.keys()) == RECENT_KEYS
    assert "id" not in item
    assert item["claim_id"] == "POL-RECENT"
    assert item["risk_level"] == "MEDIUM"
    assert item["risk_score"] == 50.0
    assert item["recommendation"] == "ENHANCED_REVIEW"


def test_recent_activity_tie_breaks_deterministically(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-RECENT-TIE")
    same = datetime(2024, 4, 1, 9, 0, 0)
    _add_analysis(Session, c, "T-1", same)
    _add_analysis(Session, c, "T-2", same)
    _add_analysis(Session, c, "T-3", same)

    body = client.get(URL).json()

    assert [a["analysis_id"] for a in body["recent_analyses"]] == ["T-3", "T-2", "T-1"]


def test_recent_activity_defaults_and_missing_fields(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-NULLS")
    _add_analysis(Session, c, "N-1", datetime(2024, 5, 1))

    body = client.get(URL).json()

    item = body["recent_analyses"][0]
    assert item["analysis_id"] == "N-1"
    assert item["claim_id"] == "POL-NULLS"
    assert item["fraud_probability"] is None
    assert item["predicted_claim_amount"] is None
    assert item["anomaly_score"] is None
    assert item["risk_score"] is None
    assert item["risk_level"] is None
    assert item["recommendation"] is None


def test_recent_limit_is_validated(client, sqlite_db):
    assert client.get(f"{URL}?recent_limit=0").status_code == 422
    assert client.get(f"{URL}?recent_limit=21").status_code == 422
    assert client.get(f"{URL}?recent_limit=1").status_code == 200


# --- Read-only guarantees and errors ---------------------------------------

def test_summary_does_not_invoke_the_ml_analyzer(client, sqlite_db, monkeypatch):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-READONLY")
    _add_analysis(Session, c, "A-1", datetime(2024, 1, 1), risk_level="LOW")

    def exploding_analyze(data):
        raise AssertionError("ML analyzer must not run for the dashboard")

    monkeypatch.setattr(claims_router.analyzer, "analyze", exploding_analyze)

    assert client.get(URL).status_code == 200


def test_database_failure_returns_500(client, sqlite_db, monkeypatch):
    def boom(db):
        raise SQLAlchemyError("simulated database failure")

    monkeypatch.setattr(repository, "count_analyses", boom)

    response = client.get(URL)

    assert response.status_code == 500
    assert response.json()["detail"] == "The dashboard summary could not be retrieved"


def test_existing_endpoints_still_work(client, sqlite_db, monkeypatch):
    """The dashboard router must not disturb existing contracts."""
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-COMPAT")
    _add_analysis(Session, c, "A-1", datetime(2024, 1, 1), risk_level="LOW")

    assert client.get("/api/v1/claims/POL-COMPAT").status_code == 200
    assert client.get("/api/v1/claims/POL-COMPAT/analyses").status_code == 200
    assert client.get("/api/v1/analyses/A-1").status_code == 200
    assert client.get("/api/v1/analyses/A-1/reviews").status_code == 200
    assert client.get(URL).status_code == 200


# ===========================================================================
# Step 7: operational insights
# ===========================================================================

QUEUE_URL = "/api/v1/dashboard/review-queue"

QUEUE_KEYS = {
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


def _queue(client, **params):
    response = client.get(QUEUE_URL, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _queue_ids(body):
    return [item["analysis_id"] for item in body["items"]]


# --- Risk x review status --------------------------------------------------

def test_risk_review_status_splits_analyses_per_bucket(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-STATUS")
    low_a = _add_analysis(Session, c, "S-LOW-A", datetime(2024, 1, 1), risk_level="LOW")
    _add_analysis(Session, c, "S-LOW-B", datetime(2024, 1, 2), risk_level="low")
    _add_analysis(Session, c, "S-HIGH", datetime(2024, 1, 3), risk_level="HIGH")
    unknown = _add_analysis(Session, c, "S-UNK", datetime(2024, 1, 4), risk_level=None)
    _add_analysis(Session, c, "S-WEIRD", datetime(2024, 1, 5), risk_level="sideways")

    _add_review(Session, low_a, "APPROVED", datetime(2024, 2, 1), claim_fk=c)
    # Two review records for the same analysis must still count as one analysis.
    _add_review(Session, low_a, "REJECTED", datetime(2024, 2, 2), claim_fk=c)
    _add_review(Session, unknown, "ESCALATED", datetime(2024, 2, 3), claim_fk=c)

    body = client.get(URL).json()

    assert body["risk_review_status"]["LOW"] == {
        "total": 2,
        "awaiting_review": 1,
        "reviewed": 1,
    }
    assert body["risk_review_status"]["HIGH"] == {
        "total": 1,
        "awaiting_review": 1,
        "reviewed": 0,
    }
    assert body["risk_review_status"]["CRITICAL"] == {
        "total": 0,
        "awaiting_review": 0,
        "reviewed": 0,
    }
    assert body["risk_review_status"]["UNKNOWN"] == {
        "total": 2,
        "awaiting_review": 1,
        "reviewed": 1,
    }
    # Existing distribution semantics are unchanged by the new field.
    assert body["risk_distribution"]["UNKNOWN"] == 2
    assert body["analyses_with_reviews"] == 2


def test_risk_review_status_empty_database(client, sqlite_db):
    body = client.get(URL).json()

    expected = {"total": 0, "awaiting_review": 0, "reviewed": 0}
    for key in RISK_KEYS:
        assert body["risk_review_status"][key] == expected
    assert body["recent_reviews"] == []
    assert body["oldest_awaiting_analyzed_at"] is None


# --- Recent review records -------------------------------------------------

def test_recent_reviews_newest_first_with_context(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-RRECENT")
    a1 = _add_analysis(
        Session, c, "RR-1", datetime(2024, 1, 1), risk_level="HIGH"
    )
    a2 = _add_analysis(
        Session, c, "RR-2", datetime(2024, 1, 2), risk_level="LOW"
    )

    _add_review(
        Session,
        a1,
        "NEEDS_MORE_INFO",
        datetime(2024, 2, 1),
        claim_fk=c,
        reviewer_id=None,
    )
    _add_review(
        Session,
        a2,
        "APPROVED",
        datetime(2024, 2, 2),
        claim_fk=c,
        reviewer_id="OFFICER-9",
    )

    reviews = client.get(URL).json()["recent_reviews"]

    assert [r["analysis_id"] for r in reviews] == ["RR-2", "RR-1"]
    newest = reviews[0]
    assert newest["final_decision"] == "APPROVED"
    assert newest["reviewer_id"] == "OFFICER-9"
    assert newest["claim_id"] == "POL-RRECENT"
    assert newest["risk_level"] == "LOW"
    assert newest["review_id"] is not None
    # Nullable reviewer ids are preserved rather than substituted.
    assert reviews[1]["reviewer_id"] is None
    assert reviews[1]["risk_level"] == "HIGH"

    limited = client.get(f"{URL}?recent_reviews_limit=1").json()["recent_reviews"]
    assert [r["analysis_id"] for r in limited] == ["RR-2"]


def test_recent_reviews_exclude_orphans_and_normalise_outcome(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-RORPHAN")
    a1 = _add_analysis(Session, c, "RO-1", datetime(2024, 1, 1))
    _add_review(Session, a1, "MAYBE", datetime(2024, 2, 1), claim_fk=c)
    _add_review(Session, None, "APPROVED", datetime(2024, 2, 2), claim_fk=c)

    body = client.get(URL).json()

    assert body["totals"]["reviews"] == 2
    assert len(body["recent_reviews"]) == 1
    assert body["recent_reviews"][0]["analysis_id"] == "RO-1"
    assert body["recent_reviews"][0]["final_decision"] == "UNKNOWN"


# --- Review aging ----------------------------------------------------------

def test_oldest_awaiting_analyzed_at(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-AGING")
    oldest = _add_analysis(Session, c, "AGE-1", datetime(2024, 1, 1))
    _add_analysis(Session, c, "AGE-2", datetime(2024, 1, 5))
    reviewed = _add_analysis(Session, c, "AGE-REV", datetime(2024, 1, 3))
    _add_review(Session, reviewed, "APPROVED", datetime(2024, 2, 1), claim_fk=c)

    body = client.get(URL).json()
    assert body["oldest_awaiting_analyzed_at"].startswith("2024-01-01T00:00:00")

    # Reviewing the oldest awaiting analysis moves the marker forward.
    _add_review(Session, oldest, "APPROVED", datetime(2024, 2, 2), claim_fk=c)
    body = client.get(URL).json()
    assert body["oldest_awaiting_analyzed_at"].startswith("2024-01-05T00:00:00")


def test_oldest_awaiting_analyzed_at_null_when_all_reviewed(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-AGING-EMPTY")
    a1 = _add_analysis(Session, c, "AGE-ONLY", datetime(2024, 1, 1))
    _add_review(Session, a1, "REJECTED", datetime(2024, 2, 1), claim_fk=c)

    assert client.get(URL).json()["oldest_awaiting_analyzed_at"] is None


# --- Review queue: scopes --------------------------------------------------

def test_review_queue_empty_database(client, sqlite_db):
    body = _queue(client)

    assert body == {"items": [], "total": 0, "limit": 10, "offset": 0}


def test_review_queue_scopes(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-QSCOPE")
    _add_analysis(Session, c, "Q-AWAIT", datetime(2024, 1, 1), risk_level="LOW")
    approved = _add_analysis(
        Session, c, "Q-APPROVED", datetime(2024, 1, 2), risk_level="LOW"
    )
    more_info = _add_analysis(
        Session, c, "Q-MORE", datetime(2024, 1, 3), risk_level="HIGH"
    )
    _add_review(Session, approved, "APPROVED", datetime(2024, 2, 1), claim_fk=c)
    _add_review(Session, more_info, "NEEDS_MORE_INFO", datetime(2024, 2, 2), claim_fk=c)

    awaiting = _queue(client, scope="awaiting")
    assert _queue_ids(awaiting) == ["Q-AWAIT"]
    assert awaiting["total"] == 1

    open_items = _queue(client, scope="open")
    assert set(_queue_ids(open_items)) == {"Q-AWAIT", "Q-MORE"}
    assert open_items["total"] == 2

    every = _queue(client, scope="all")
    assert set(_queue_ids(every)) == {"Q-AWAIT", "Q-APPROVED", "Q-MORE"}
    assert every["total"] == 3


def test_open_scope_uses_only_the_latest_review_outcome(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-QLATEST")

    resolved = _add_analysis(Session, c, "QL-RESOLVED", datetime(2024, 1, 1))
    reopened = _add_analysis(Session, c, "QL-REOPENED", datetime(2024, 1, 2))
    never = _add_analysis(Session, c, "QL-NEVER", datetime(2024, 1, 3))
    rejected = _add_analysis(Session, c, "QL-REJECTED", datetime(2024, 1, 4))

    # Older NEEDS_MORE_INFO is superseded by APPROVED -> not open.
    _add_review(Session, resolved, "NEEDS_MORE_INFO", datetime(2024, 2, 1), claim_fk=c)
    _add_review(Session, resolved, "APPROVED", datetime(2024, 2, 2), claim_fk=c)
    # Older APPROVED is superseded by ESCALATED -> open.
    _add_review(Session, reopened, "APPROVED", datetime(2024, 2, 3), claim_fk=c)
    _add_review(Session, reopened, "ESCALATED", datetime(2024, 2, 4), claim_fk=c)
    # NEEDS_MORE_INFO then REJECTED -> closed.
    _add_review(Session, rejected, "NEEDS_MORE_INFO", datetime(2024, 2, 5), claim_fk=c)
    _add_review(Session, rejected, "REJECTED", datetime(2024, 2, 6), claim_fk=c)

    open_ids = _queue_ids(_queue(client, scope="open"))
    assert set(open_ids) == {"QL-REOPENED", "QL-NEVER"}

    all_ids = set(_queue_ids(_queue(client, scope="all")))
    assert all_ids == {
        "QL-RESOLVED",
        "QL-REOPENED",
        "QL-NEVER",
        "QL-REJECTED",
    }


# --- Review queue: item payload -------------------------------------------

def test_review_queue_item_payload_and_review_counts(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(
        Session,
        "POL-QITEM",
        incident_type="collision",
        claim_amount=4200.5,
    )
    analysis = _add_analysis(
        Session,
        c,
        "QI-1",
        datetime(2024, 1, 1),
        risk_level="HIGH",
        risk_score=88.0,
        fraud_probability=0.72,
        predicted_claim_amount=3900.0,
        anomaly_score=0.41,
        recommendation={"recommendation": "ENHANCED_REVIEW"},
    )
    _add_review(Session, analysis, "NEEDS_MORE_INFO", datetime(2024, 2, 1), claim_fk=c)
    _add_review(Session, analysis, "ESCALATED", datetime(2024, 2, 2), claim_fk=c)

    body = _queue(client, scope="all")
    item = body["items"][0]

    assert set(item.keys()) == QUEUE_KEYS
    assert "id" not in item
    assert item["analysis_id"] == "QI-1"
    assert item["claim_id"] == "POL-QITEM"
    assert item["risk_score"] == 88.0
    assert item["risk_level"] == "HIGH"
    assert item["fraud_probability"] == 0.72
    assert item["predicted_claim_amount"] == 3900.0
    assert item["anomaly_score"] == 0.41
    assert item["recommendation"] == "ENHANCED_REVIEW"
    assert item["review_count"] == 2
    assert item["latest_review_outcome"] == "ESCALATED"
    assert item["latest_reviewed_at"].startswith("2024-02-02T00:00:00")
    assert item["incident_type"] == "collision"
    assert item["claim_amount"] == 4200.5


def test_review_queue_awaiting_items_have_no_review_data(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-QNOREV")
    _add_analysis(Session, c, "QN-1", datetime(2024, 1, 1))

    item = _queue(client)["items"][0]

    assert item["review_count"] == 0
    assert item["latest_review_outcome"] is None
    assert item["latest_reviewed_at"] is None
    assert item["incident_type"] is None
    assert item["claim_amount"] is None
    assert item["recommendation"] is None


# --- Review queue: risk filter --------------------------------------------

def test_review_queue_risk_filter_is_case_insensitive_and_trimmed(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-QRISK")
    _add_analysis(Session, c, "QF-1", datetime(2024, 1, 1), risk_level="high")
    _add_analysis(Session, c, "QF-2", datetime(2024, 1, 2), risk_level="HIGH")
    _add_analysis(Session, c, "QF-3", datetime(2024, 1, 3), risk_level=" high ")
    _add_analysis(Session, c, "QF-4", datetime(2024, 1, 4), risk_level="LOW")
    _add_analysis(Session, c, "QF-5", datetime(2024, 1, 5), risk_level=None)
    _add_analysis(Session, c, "QF-6", datetime(2024, 1, 6), risk_level="sideways")

    assert _queue(client, risk_level="high")["total"] == 3
    assert _queue(client, risk_level="HIGH")["total"] == 3
    assert _queue(client, risk_level="Low")["total"] == 1
    assert _queue(client, risk_level="unknown")["total"] == 2
    # Empty means "no filter".
    assert _queue(client, risk_level="")["total"] == 6
    # An invalid bucket is rejected rather than silently returning nothing.
    assert client.get(QUEUE_URL, params={"risk_level": "banana"}).status_code == 422


# --- Review queue: ordering ------------------------------------------------

def test_review_queue_risk_ordering_nulls_and_timestamps(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-QORDER")
    _add_analysis(
        Session,
        c,
        "QO-HIGH-RECENT",
        datetime(2024, 2, 1),
        risk_score=90.0,
    )
    _add_analysis(
        Session,
        c,
        "QO-HIGH-OLD",
        datetime(2024, 1, 1),
        risk_score=90.0,
    )
    _add_analysis(Session, c, "QO-MID", datetime(2024, 1, 15), risk_score=50.0)
    mid = _add_analysis(Session, c, "QO-MID-NULL", datetime(2024, 1, 15), risk_score=50.0)
    _clear_analyzed_at(Session, mid)
    _add_analysis(Session, c, "QO-NO-SCORE", datetime(2024, 3, 1), risk_score=None)

    ids = _queue_ids(_queue(client))
    assert ids == ["QO-HIGH-OLD", "QO-HIGH-RECENT", "QO-MID", "QO-MID-NULL", "QO-NO-SCORE"]


def test_review_queue_risk_ordering_tie_breaks_on_id(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-QTIE")
    same = datetime(2024, 1, 1)
    _add_analysis(Session, c, "QT-FIRST", same, risk_score=70.0)
    _add_analysis(Session, c, "QT-SECOND", same, risk_score=70.0)
    _add_analysis(Session, c, "QT-THIRD", same, risk_score=70.0)

    assert _queue_ids(_queue(client)) == ["QT-THIRD", "QT-SECOND", "QT-FIRST"]


def test_review_queue_recent_ordering(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-QRECENT")
    _add_analysis(Session, c, "QR-OLD", datetime(2024, 1, 1), risk_score=99.0)
    _add_analysis(Session, c, "QR-NEW", datetime(2024, 3, 1), risk_score=10.0)
    _add_analysis(Session, c, "QR-MID", datetime(2024, 2, 1), risk_score=50.0)
    none_at = _add_analysis(Session, c, "QR-NONE", datetime(2024, 1, 15), risk_score=100.0)
    _clear_analyzed_at(Session, none_at)

    ids = _queue_ids(_queue(client, order="recent"))
    assert ids == ["QR-NEW", "QR-MID", "QR-OLD", "QR-NONE"]


# --- Review queue: pagination ---------------------------------------------

def test_review_queue_pagination_and_total(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-QPAGE")
    for i in range(1, 6):
        _add_analysis(
            Session, c, f"QP-{i}", datetime(2024, 1, i), risk_score=float(i)
        )

    first = _queue(client, limit=2, offset=0)
    assert first["total"] == 5
    assert first["limit"] == 2
    assert first["offset"] == 0
    assert _queue_ids(first) == ["QP-5", "QP-4"]

    last = _queue(client, limit=2, offset=4)
    assert last["total"] == 5
    assert _queue_ids(last) == ["QP-1"]

    beyond = _queue(client, limit=2, offset=10)
    assert beyond["items"] == []
    assert beyond["total"] == 5


def test_review_queue_parameters_are_validated(client, sqlite_db):
    assert client.get(QUEUE_URL, params={"limit": 0}).status_code == 422
    assert client.get(QUEUE_URL, params={"limit": 51}).status_code == 422
    assert client.get(QUEUE_URL, params={"offset": -1}).status_code == 422
    assert client.get(QUEUE_URL, params={"scope": "nope"}).status_code == 422
    assert client.get(QUEUE_URL, params={"order": "nope"}).status_code == 422


# --- Review queue: unknown values and orphans -----------------------------

def test_review_queue_normalises_unknown_outcome(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-QUNKNOWN")
    a1 = _add_analysis(
        Session, c, "QU-1", datetime(2024, 1, 1), risk_level="sideways"
    )
    _add_review(Session, a1, "MAYBE", datetime(2024, 2, 1), claim_fk=c)

    item = _queue(client, scope="all")["items"][0]
    assert item["latest_review_outcome"] == "UNKNOWN"
    assert item["review_count"] == 1
    assert item["risk_level"] == "sideways"

    # An unrecognised outcome is not one of the "open" outcomes.
    assert _queue(client, scope="open")["items"] == []
    # The UNKNOWN risk bucket matches it.
    assert _queue(client, scope="all", risk_level="UNKNOWN")["total"] == 1


def test_review_queue_ignores_orphan_reviews(client, sqlite_db):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-QORPHAN")
    _add_analysis(Session, c, "QO-1", datetime(2024, 1, 1))
    _add_review(Session, None, "APPROVED", datetime(2024, 2, 1), claim_fk=c)

    awaiting = _queue(client)
    assert awaiting["total"] == 1
    assert awaiting["items"][0]["review_count"] == 0
    assert awaiting["items"][0]["latest_review_outcome"] is None
    assert _queue(client, scope="open")["total"] == 1
    assert _queue(client, scope="all")["total"] == 1


# --- Review queue: read-only and errors -----------------------------------

def test_review_queue_does_not_invoke_ml_or_write(client, sqlite_db, monkeypatch):
    _, Session = sqlite_db
    c = _add_claim(Session, "POL-QREADONLY")
    _add_analysis(Session, c, "QRO-1", datetime(2024, 1, 1), risk_level="HIGH")

    def exploding_analyze(data):
        raise AssertionError("ML analyzer must not run for the review queue")

    monkeypatch.setattr(claims_router.analyzer, "analyze", exploding_analyze)

    before = client.get(URL).json()["totals"]
    first = _queue(client)
    second = _queue(client)
    after = client.get(URL).json()["totals"]

    assert first == second
    assert before == after
    assert after == {"claims": 1, "analyses": 1, "reviews": 0}


def test_review_queue_database_failure_returns_500(client, sqlite_db, monkeypatch):
    def boom(db, **kwargs):
        raise SQLAlchemyError("simulated database failure")

    monkeypatch.setattr(repository, "count_review_queue", boom)

    response = client.get(QUEUE_URL)

    assert response.status_code == 500
    assert response.json()["detail"] == "The review queue could not be retrieved"
