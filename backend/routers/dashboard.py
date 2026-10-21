"""Dashboard endpoints: summary metrics, operational insights and review queue.

Aggregates persisted records only. Nothing here runs ML inference, fabricates a
value, or counts an analysis as though it were a unique claim. The queue is a
prioritisation aid only: it never approves, rejects or declares fraud.

Counting rules (see ``backend/db/repository.py`` for the queries):

- ``totals.claims``    persisted claims (distinct claim records).
- ``totals.analyses``  persisted analyses (never labelled as unique claims).
- ``totals.reviews``   total review *records* (an analysis may have several).
- ``high_critical_analyses``   analyses with risk level HIGH or CRITICAL.
- ``risk_distribution``        analyses grouped by risk level (unknown -> UNKNOWN).
- ``review_outcomes``          review records grouped by outcome.
- ``analyses_with_reviews``    analyses that have at least one review.
- ``latest_review_outcomes``   analyses grouped by the outcome of their most
                               recently recorded review (append-only: highest id).
- ``analyses_awaiting_review`` analyses with no recorded review. Every analysis
                               requires a human decision (the decision engine
                               always sets ``human_decision_required``), so an
                               analysis with no review is awaiting one.
- ``risk_review_status``       per risk bucket, analyses split into reviewed and
                               awaiting review. Counts analyses, not reviews.
- ``recent_reviews``           newest human-review *records* (orphans excluded).
- ``oldest_awaiting_analyzed_at`` oldest ``analyzed_at`` among unreviewed
                               analyses, or null when nothing is waiting.

Review queue scopes:

- ``awaiting`` analyses with zero review records.
- ``open``     zero reviews, or the latest review outcome is NEEDS_MORE_INFO or
               ESCALATED.
- ``all``      every analysis, including reviewed ones.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.db import database, repository, schemas as db_schemas

logger = logging.getLogger(__name__)

router = APIRouter()

RISK_LEVELS = ("LOW", "MEDIUM", "HIGH", "CRITICAL")
UNKNOWN = "UNKNOWN"
QUEUE_SCOPES = ("awaiting", "open", "all")
QUEUE_ORDERS = ("risk", "recent")


def _normalize_counts(rows, allowed) -> dict:
    """Fold raw ``(value, count)`` pairs into fixed buckets.

    Values are upper-cased and trimmed; anything outside ``allowed`` (including
    ``None``) lands in ``UNKNOWN`` instead of being discarded.
    """
    counts = {key: 0 for key in allowed}
    counts[UNKNOWN] = 0
    for raw_key, count in rows:
        key = raw_key.strip().upper() if isinstance(raw_key, str) else None
        if key in counts:
            counts[key] += int(count)
        else:
            counts[UNKNOWN] += int(count)
    return counts


def _normalize_outcome(value: Optional[str]) -> Optional[str]:
    """Normalise a stored review outcome to an accepted label or ``UNKNOWN``.

    ``None`` is preserved so callers can tell "no review yet" apart from a
    review whose stored outcome is not recognised.
    """
    if value is None:
        return None
    if not isinstance(value, str):
        return UNKNOWN
    normalized = value.strip().upper()
    return normalized if normalized in db_schemas.REVIEW_OUTCOMES else UNKNOWN


def _normalize_risk_filter(risk_level: Optional[str]) -> Optional[str]:
    """Validate and normalise the optional queue risk filter.

    Empty/whitespace means "no filter". Unknown labels are rejected rather than
    silently returning an empty queue.
    """
    if risk_level is None:
        return None
    normalized = risk_level.strip().upper()
    if not normalized:
        return None
    if normalized not in (*RISK_LEVELS, UNKNOWN):
        raise HTTPException(
            status_code=422,
            detail=(
                "risk_level must be one of: "
                + ", ".join((*RISK_LEVELS, UNKNOWN))
            ),
        )
    return normalized


def _recommendation_label(analysis) -> "str | None":
    """Extract the recommendation label from the stored decision payload."""
    recommendation = analysis.recommendation
    if isinstance(recommendation, dict):
        candidate = recommendation.get("recommendation")
        if isinstance(candidate, str):
            return candidate
    return None


def _serialize_recent(analysis) -> dict:
    claim = analysis.claim
    return {
        "analysis_id": analysis.analysis_id,
        "claim_id": claim.claim_id if claim is not None else None,
        "analyzed_at": analysis.analyzed_at,
        "fraud_probability": analysis.fraud_probability,
        "predicted_claim_amount": analysis.predicted_claim_amount,
        "anomaly_score": analysis.anomaly_score,
        "risk_score": analysis.risk_score,
        "risk_level": analysis.risk_level,
        "recommendation": _recommendation_label(analysis),
    }


def _serialize_queue_item(
    analysis,
    latest_outcome: Optional[str],
    latest_reviewed_at,
    review_count: int,
) -> dict:
    """Public queue row. Internal primary keys are never exposed."""
    claim = analysis.claim
    return {
        "analysis_id": analysis.analysis_id,
        "claim_id": claim.claim_id if claim is not None else None,
        "analyzed_at": analysis.analyzed_at,
        "risk_score": analysis.risk_score,
        "risk_level": analysis.risk_level,
        "fraud_probability": analysis.fraud_probability,
        "predicted_claim_amount": analysis.predicted_claim_amount,
        "anomaly_score": analysis.anomaly_score,
        "recommendation": _recommendation_label(analysis),
        "review_count": review_count,
        "latest_review_outcome": _normalize_outcome(latest_outcome),
        "latest_reviewed_at": latest_reviewed_at,
        "incident_type": claim.incident_type if claim is not None else None,
        "claim_amount": claim.claim_amount if claim is not None else None,
    }


def _serialize_recent_review(review, analysis, claim) -> dict:
    return {
        "review_id": review.review_id,
        "final_decision": _normalize_outcome(review.final_decision),
        "reviewer_id": review.reviewer_id,
        "reviewed_at": review.reviewed_at,
        "analysis_id": analysis.analysis_id if analysis is not None else None,
        "claim_id": claim.claim_id if claim is not None else None,
        "risk_level": analysis.risk_level if analysis is not None else None,
    }


def _risk_review_status(totals: dict, reviewed: dict) -> dict:
    """Combine per-bucket analysis totals with reviewed counts.

    ``reviewed`` is clamped to ``total`` so a transient inconsistency can never
    produce a negative awaiting count.
    """
    status = {}
    for key in (*RISK_LEVELS, UNKNOWN):
        total = int(totals.get(key, 0))
        reviewed_count = min(int(reviewed.get(key, 0)), total)
        status[key] = {
            "total": total,
            "awaiting_review": max(total - reviewed_count, 0),
            "reviewed": reviewed_count,
        }
    return status


@router.get("/dashboard/summary", response_model=db_schemas.DashboardSummaryDB)
def dashboard_summary(
    recent_limit: int = Query(5, ge=1, le=20),
    recent_reviews_limit: int = Query(5, ge=1, le=20),
    db: Session = Depends(database.get_db),
):
    """Return dashboard metrics and recent activity from persisted records."""
    try:
        total_analyses = repository.count_analyses(db)
        with_reviews = repository.count_analyses_with_reviews(db)
        risk_totals = _normalize_counts(
            repository.count_analyses_by_risk_level(db), RISK_LEVELS
        )
        risk_reviewed = _normalize_counts(
            repository.count_reviewed_analyses_by_risk_level(db), RISK_LEVELS
        )
        return {
            "totals": {
                "claims": repository.count_claims(db),
                "analyses": total_analyses,
                "reviews": repository.count_reviews(db),
            },
            "high_critical_analyses": repository.count_high_or_critical_analyses(db),
            "analyses_with_reviews": with_reviews,
            "analyses_awaiting_review": max(total_analyses - with_reviews, 0),
            "risk_distribution": risk_totals,
            "review_outcomes": _normalize_counts(
                repository.count_reviews_by_outcome(db), db_schemas.REVIEW_OUTCOMES
            ),
            "latest_review_outcomes": _normalize_counts(
                repository.count_latest_review_outcomes(db),
                db_schemas.REVIEW_OUTCOMES,
            ),
            "recent_analyses": [
                _serialize_recent(a)
                for a in repository.list_recent_analyses(db, recent_limit)
            ],
            "risk_review_status": _risk_review_status(risk_totals, risk_reviewed),
            "recent_reviews": [
                _serialize_recent_review(review, analysis, claim)
                for review, analysis, claim in repository.list_recent_reviews(
                    db, recent_reviews_limit
                )
            ],
            "oldest_awaiting_analyzed_at": (
                repository.oldest_awaiting_analyzed_at(db)
            ),
        }
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to build the dashboard summary")
        raise HTTPException(
            status_code=500, detail="The dashboard summary could not be retrieved"
        )


@router.get(
    "/dashboard/review-queue",
    response_model=db_schemas.DashboardReviewQueueDB,
)
def dashboard_review_queue(
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    scope: str = Query("awaiting", pattern="^(awaiting|open|all)$"),
    risk_level: Optional[str] = Query(None),
    order: str = Query("risk", pattern="^(risk|recent)$"),
    db: Session = Depends(database.get_db),
):
    """One page of the prioritised human-review worklist.

    ``total`` is the full number of matching analyses, independent of ``limit``.
    The queue only orders and annotates analyses; a human still decides.
    """
    risk_bucket = _normalize_risk_filter(risk_level)
    try:
        total = repository.count_review_queue(
            db, scope=scope, risk_level=risk_bucket
        )
        rows = repository.list_review_queue(
            db,
            scope=scope,
            risk_level=risk_bucket,
            limit=limit,
            offset=offset,
            order=order,
        )
        counts = repository.count_reviews_for_analyses(
            db, [analysis.id for analysis, _, _ in rows]
        )
        items = [
            _serialize_queue_item(
                analysis,
                latest_outcome,
                latest_reviewed_at,
                counts.get(analysis.id, 0),
            )
            for analysis, latest_outcome, latest_reviewed_at in rows
        ]
        return {
            "items": items,
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to build the review queue")
        raise HTTPException(
            status_code=500, detail="The review queue could not be retrieved"
        )
