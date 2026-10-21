import uuid
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload
from backend.db import models

def get_or_create_claim(db: Session, claim_data: dict):
    cid = claim_data.get("policy_id") or claim_data.get("claim_id") or str(uuid.uuid4())
    c = db.query(models.Claim).filter(models.Claim.claim_id == cid).first()
    if not c:
        c = models.Claim(claim_id=cid, policy_id=claim_data.get("policy_id"), claim_amount=claim_data.get("claim_amount"), incident_type=claim_data.get("incident_type"), incident_date=claim_data.get("incident_date"), policy_state=claim_data.get("policy_state"))
        # Flush (not commit) so the caller owns the transaction boundary and can
        # atomically persist the claim together with its analysis.
        db.add(c); db.flush()
    return c

def create_analysis(db: Session, claim_id_fk: int, res: dict):
    aid = str(uuid.uuid4())
    a = models.ClaimAnalysis(
        analysis_id=aid,
        claim_id_fk=claim_id_fk,
        fraud_probability=res.get("fraud", {}).get("probability"),
        predicted_claim_amount=res.get("severity", {}).get("predicted_claim_amount"),
        anomaly_score=res.get("anomaly", {}).get("score"),
        risk_score=res.get("risk", {}).get("score"),
        risk_level=res.get("risk", {}).get("level"),
        explanation=res.get("explanation"),
        recommendation=res.get("decision"),
        triggered_rules=res.get("decision", {}).get("triggered_rules"),
        policy_versions={"risk": res.get("risk"), "decision": res.get("decision")}
    )
    # Flush (not commit) so this insert joins the caller's transaction and is
    # rolled back together with the claim if the transaction fails.
    db.add(a); db.flush()
    return a

def get_claim(db: Session, claim_id: str):
    return db.query(models.Claim).filter(models.Claim.claim_id == claim_id).first()

def get_analysis(db: Session, analysis_id: str):
    return db.query(models.ClaimAnalysis).filter(models.ClaimAnalysis.analysis_id == analysis_id).first()

def list_analyses_for_claim(db: Session, claim_id_fk: int, limit: int = 20, offset: int = 0, descending: bool = True):
    """Paginated analyses for a claim, ordered by analyzed_at with a
    deterministic secondary key (the internal primary key, never exposed)."""
    analyzed_at = models.ClaimAnalysis.analyzed_at
    if descending:
        order_by = (analyzed_at.desc().nulls_last(), models.ClaimAnalysis.id.desc())
    else:
        order_by = (analyzed_at.asc().nulls_last(), models.ClaimAnalysis.id.asc())
    return (
        db.query(models.ClaimAnalysis)
        .filter(models.ClaimAnalysis.claim_id_fk == claim_id_fk)
        .order_by(*order_by)
        .offset(offset)
        .limit(limit)
        .all()
    )

def count_analyses_for_claim(db: Session, claim_id_fk: int) -> int:
    total = (
        db.query(func.count(models.ClaimAnalysis.id))
        .filter(models.ClaimAnalysis.claim_id_fk == claim_id_fk)
        .scalar()
    )
    return int(total or 0)


def create_review(
    db: Session,
    *,
    analysis: models.ClaimAnalysis,
    final_decision: str,
    reviewer_id: "str | None" = None,
    comments: "str | None" = None,
):
    """Stage a human review for a stored analysis.

    Flush (not commit) so the caller owns the transaction boundary and can roll
    the review back if anything else in the request fails. The review records
    only what the human reviewer submitted.
    """
    review = models.HumanReview(
        review_id=str(uuid.uuid4()),
        analysis_id_fk=analysis.id,
        claim_id_fk=analysis.claim_id_fk,
        reviewer_id=reviewer_id,
        final_decision=final_decision,
        comments=comments,
    )
    db.add(review)
    db.flush()
    return review


def get_review(db: Session, review_id: str):
    return (
        db.query(models.HumanReview)
        .filter(models.HumanReview.review_id == review_id)
        .first()
    )


def list_reviews_for_analysis(db: Session, analysis_id_fk: int):
    """Reviews for one analysis, newest first, with a deterministic tiebreaker."""
    reviewed_at = models.HumanReview.reviewed_at
    return (
        db.query(models.HumanReview)
        .filter(models.HumanReview.analysis_id_fk == analysis_id_fk)
        .order_by(reviewed_at.desc().nulls_last(), models.HumanReview.id.desc())
        .all()
    )


# --- Dashboard aggregates (read-only) --------------------------------------
#
# These helpers return raw persisted counts. Normalising storage values into a
# fixed set of buckets (and folding anything unrecognised into "UNKNOWN") is the
# caller's concern, so the database values are never silently rewritten here.

def count_claims(db: Session) -> int:
    """Total persisted claims (distinct claim records)."""
    total = db.query(func.count(models.Claim.id)).scalar()
    return int(total or 0)


def count_analyses(db: Session) -> int:
    """Total persisted analyses. This is not a count of unique claims."""
    total = db.query(func.count(models.ClaimAnalysis.id)).scalar()
    return int(total or 0)


def count_high_or_critical_analyses(db: Session) -> int:
    """Analyses whose stored risk level is HIGH or CRITICAL (case-insensitive)."""
    total = (
        db.query(func.count(models.ClaimAnalysis.id))
        .filter(
            func.upper(models.ClaimAnalysis.risk_level).in_(("HIGH", "CRITICAL"))
        )
        .scalar()
    )
    return int(total or 0)


def count_analyses_by_risk_level(db: Session):
    """Raw ``(risk_level, count)`` pairs across all persisted analyses."""
    return (
        db.query(
            models.ClaimAnalysis.risk_level,
            func.count(models.ClaimAnalysis.id),
        )
        .group_by(models.ClaimAnalysis.risk_level)
        .all()
    )


def count_reviews(db: Session) -> int:
    """Total persisted human review records (an analysis may have several)."""
    total = db.query(func.count(models.HumanReview.id)).scalar()
    return int(total or 0)


def count_reviews_by_outcome(db: Session):
    """Raw ``(final_decision, count)`` pairs across review records."""
    return (
        db.query(
            models.HumanReview.final_decision,
            func.count(models.HumanReview.id),
        )
        .group_by(models.HumanReview.final_decision)
        .all()
    )


def count_analyses_with_reviews(db: Session) -> int:
    """Analyses that have at least one recorded human review."""
    total = (
        db.query(
            func.count(func.distinct(models.HumanReview.analysis_id_fk))
        )
        .filter(models.HumanReview.analysis_id_fk.isnot(None))
        .scalar()
    )
    return int(total or 0)


def count_latest_review_outcomes(db: Session):
    """Outcome of each analysis's most recently recorded review.

    Reviews are append-only, so the highest review primary key per analysis is
    its latest review. Returns raw ``(final_decision, count)`` pairs over
    analyses that have at least one review (orphan reviews with no analysis are
    ignored).
    """
    latest_ids = (
        db.query(func.max(models.HumanReview.id).label("review_id"))
        .filter(models.HumanReview.analysis_id_fk.isnot(None))
        .group_by(models.HumanReview.analysis_id_fk)
        .subquery()
    )
    return (
        db.query(
            models.HumanReview.final_decision,
            func.count(models.HumanReview.id),
        )
        .join(latest_ids, models.HumanReview.id == latest_ids.c.review_id)
        .group_by(models.HumanReview.final_decision)
        .all()
    )


def list_recent_analyses(db: Session, limit: int = 5):
    """Newest analyses across all claims, with a deterministic tiebreaker."""
    analyzed_at = models.ClaimAnalysis.analyzed_at
    return (
        db.query(models.ClaimAnalysis)
        .order_by(analyzed_at.desc().nulls_last(), models.ClaimAnalysis.id.desc())
        .limit(limit)
        .all()
    )


# --- Operational dashboard helpers (read-only) -----------------------------
#
# These helpers back the review queue and the review-status insights. They only
# read persisted rows; they never run ML inference and never modify data.
# Internal primary keys are used for joins/ordering but are never returned to
# callers (the routers expose public identifiers only).

#: Risk buckets with a dedicated presentation. Anything else folds into UNKNOWN.
KNOWN_RISK_LEVELS = ("LOW", "MEDIUM", "HIGH", "CRITICAL")

OPEN_REVIEW_OUTCOMES = ("NEEDS_MORE_INFO", "ESCALATED")


def _latest_review_subquery(db: Session):
    """Latest review per analysis (append-only: highest review id wins).

    Returns ``analysis_id_fk``, ``final_decision`` and ``reviewed_at`` so callers
    can both decide "open" status and render the latest outcome without a
    second round-trip. Orphan reviews (no analysis) are excluded.
    """
    latest_ids = (
        db.query(
            models.HumanReview.analysis_id_fk.label("analysis_id_fk"),
            func.max(models.HumanReview.id).label("review_id"),
        )
        .filter(models.HumanReview.analysis_id_fk.isnot(None))
        .group_by(models.HumanReview.analysis_id_fk)
        .subquery()
    )
    return (
        db.query(
            models.HumanReview.analysis_id_fk.label("analysis_id_fk"),
            models.HumanReview.final_decision.label("final_decision"),
            models.HumanReview.reviewed_at.label("reviewed_at"),
        )
        .join(latest_ids, models.HumanReview.id == latest_ids.c.review_id)
        .subquery()
    )


def _reviewed_analysis_ids_subquery(db: Session):
    """Distinct analyses that have at least one review record."""
    return (
        db.query(models.HumanReview.analysis_id_fk.label("analysis_id_fk"))
        .filter(models.HumanReview.analysis_id_fk.isnot(None))
        .distinct()
        .subquery()
    )


def _normalized_risk_level_expression():
    """Stored risk level upper-cased and trimmed, for case-insensitive matching."""
    return func.upper(func.trim(models.ClaimAnalysis.risk_level))


def _risk_filter_condition(risk_level: str):
    """Build a condition for one normalised risk bucket.

    ``UNKNOWN`` matches a missing level or any value outside the known buckets,
    mirroring how the dashboard folds unrecognised values into ``UNKNOWN``.
    """
    normalized = risk_level.strip().upper()
    expression = _normalized_risk_level_expression()
    if normalized == "UNKNOWN":
        return or_(
            models.ClaimAnalysis.risk_level.is_(None),
            expression.notin_(KNOWN_RISK_LEVELS),
        )
    return expression == normalized


def _apply_review_queue_filters(query, latest, scope: str, risk_level):
    """Apply the scope and optional risk filter to a queue query."""
    if scope == "awaiting":
        query = query.filter(latest.c.analysis_id_fk.is_(None))
    elif scope == "open":
        query = query.filter(
            or_(
                latest.c.analysis_id_fk.is_(None),
                func.upper(func.trim(latest.c.final_decision)).in_(
                    OPEN_REVIEW_OUTCOMES
                ),
            )
        )
    elif scope != "all":
        raise ValueError(f"Unsupported review queue scope: {scope!r}")

    if risk_level:
        query = query.filter(_risk_filter_condition(risk_level))
    return query


def _review_queue_query(db: Session, scope: str, risk_level):
    """Base queue query with the latest-review join applied.

    ``scope`` is validated by the router. ``awaiting`` = no reviews; ``open`` =
    no reviews or a latest outcome in ``OPEN_REVIEW_OUTCOMES``; ``all`` = every
    analysis. ``risk_level`` is already normalised (or ``None``).
    """
    latest = _latest_review_subquery(db)
    query = db.query(
        models.ClaimAnalysis,
        latest.c.final_decision.label("latest_review_outcome"),
        latest.c.reviewed_at.label("latest_reviewed_at"),
    ).outerjoin(latest, models.ClaimAnalysis.id == latest.c.analysis_id_fk)
    query = _apply_review_queue_filters(query, latest, scope, risk_level)

    # joinedload avoids a per-row query for the claim context.
    return query.options(joinedload(models.ClaimAnalysis.claim))


def count_review_queue(db: Session, *, scope: str = "awaiting", risk_level=None) -> int:
    """Total matching analyses for a queue query, independent of paging."""
    latest = _latest_review_subquery(db)
    query = db.query(func.count(models.ClaimAnalysis.id)).outerjoin(
        latest, models.ClaimAnalysis.id == latest.c.analysis_id_fk
    )
    query = _apply_review_queue_filters(query, latest, scope, risk_level)
    return int(query.scalar() or 0)


def list_review_queue(
    db: Session,
    *,
    scope: str = "awaiting",
    risk_level=None,
    limit: int = 10,
    offset: int = 0,
    order: str = "risk",
):
    """One page of the prioritised review queue.

    Returns ``(analysis, latest_outcome, latest_reviewed_at)`` tuples. The
    ``risk`` order puts the highest score first (nulls last), then the oldest
    awaiting item, then the internal id as a deterministic tiebreaker. The
    ``recent`` order is newest ``analyzed_at`` first with the same tiebreaker.
    """
    analyzed_at = models.ClaimAnalysis.analyzed_at
    if order == "risk":
        order_by = (
            models.ClaimAnalysis.risk_score.desc().nulls_last(),
            analyzed_at.asc().nulls_last(),
            models.ClaimAnalysis.id.desc(),
        )
    elif order == "recent":
        order_by = (
            analyzed_at.desc().nulls_last(),
            models.ClaimAnalysis.id.desc(),
        )
    else:
        raise ValueError(f"Unsupported review queue order: {order!r}")

    return (
        _review_queue_query(db, scope, risk_level)
        .order_by(*order_by)
        .offset(offset)
        .limit(limit)
        .all()
    )


def count_reviews_for_analyses(db: Session, analysis_ids) -> dict:
    """Map analysis primary key -> number of review records.

    ``analysis_ids`` are internal primary keys used only for grouping; callers
    never expose them. Returns an empty mapping for an empty input.
    """
    ids = list(analysis_ids)
    if not ids:
        return {}
    rows = (
        db.query(
            models.HumanReview.analysis_id_fk,
            func.count(models.HumanReview.id),
        )
        .filter(models.HumanReview.analysis_id_fk.in_(ids))
        .group_by(models.HumanReview.analysis_id_fk)
        .all()
    )
    return {int(analysis_id): int(count) for analysis_id, count in rows}


def count_reviewed_analyses_by_risk_level(db: Session):
    """Raw ``(risk_level, count)`` pairs for analyses with at least one review.

    Counts analyses (not review records), so it can be compared with
    ``count_analyses_by_risk_level`` to derive awaiting counts per bucket.
    """
    reviewed_ids = _reviewed_analysis_ids_subquery(db)
    return (
        db.query(
            models.ClaimAnalysis.risk_level,
            func.count(models.ClaimAnalysis.id),
        )
        .join(reviewed_ids, models.ClaimAnalysis.id == reviewed_ids.c.analysis_id_fk)
        .group_by(models.ClaimAnalysis.risk_level)
        .all()
    )


def list_recent_reviews(db: Session, limit: int = 5):
    """Newest human-review records with their analysis and claim context.

    Reviews with no associated analysis (orphans) are excluded via the inner
    join. Returns ``(review, analysis, claim)`` tuples; ``claim`` may be None if
    the analysis is not linked to a claim.
    """
    return (
        db.query(models.HumanReview, models.ClaimAnalysis, models.Claim)
        .join(
            models.ClaimAnalysis,
            models.HumanReview.analysis_id_fk == models.ClaimAnalysis.id,
        )
        .outerjoin(
            models.Claim,
            models.ClaimAnalysis.claim_id_fk == models.Claim.id,
        )
        .order_by(models.HumanReview.id.desc())
        .limit(limit)
        .all()
    )


def oldest_awaiting_analyzed_at(db: Session):
    """Oldest ``analyzed_at`` among analyses with no reviews, or None."""
    reviewed_ids = _reviewed_analysis_ids_subquery(db)
    return (
        db.query(func.min(models.ClaimAnalysis.analyzed_at))
        .outerjoin(
            reviewed_ids,
            models.ClaimAnalysis.id == reviewed_ids.c.analysis_id_fk,
        )
        .filter(reviewed_ids.c.analysis_id_fk.is_(None))
        .scalar()
    )
