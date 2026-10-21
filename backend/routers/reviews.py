"""Human review endpoints.

A human reviewer records a decision for one stored analysis. The platform only
stores what the reviewer explicitly submits; it never selects, approves, rejects
or escalates a claim on its own. Reviews live under the analysis they belong to,
matching the existing read endpoints in ``db_endpoints``.

Identity caveat (Phase 1): these routes are gated by the shared bearer token
(``backend.auth``), which authenticates the *client*, not an individual human.
``reviewer_id`` is therefore a client-supplied, self-reported label and is **not**
verified identity. Until a real per-reviewer identity/authorization model exists,
this field must not be presented as proof of who recorded a review.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.db import database, repository, schemas as db_schemas
from backend.db import models as db_models

logger = logging.getLogger(__name__)

router = APIRouter()


def _serialize_review(
    review: "db_models.HumanReview", analysis: "db_models.ClaimAnalysis"
) -> dict:
    """Public review payload. The internal integer primary key is never exposed."""
    claim = analysis.claim
    return {
        "review_id": review.review_id,
        "final_decision": review.final_decision,
        "reviewer_id": review.reviewer_id,
        "comments": review.comments,
        "reviewed_at": review.reviewed_at,
        "analysis_id": analysis.analysis_id,
        "claim_id": claim.claim_id if claim is not None else None,
    }


@router.post(
    "/analyses/{analysis_id}/reviews",
    response_model=db_schemas.ReviewDB,
    status_code=201,
)
def create_review(
    analysis_id: str,
    payload: db_schemas.ReviewCreate,
    db: Session = Depends(database.get_db),
):
    """Record one human review for a stored analysis.

    The request body is validated by ``ReviewCreate`` (an outcome outside the
    accepted set is rejected with 422). A missing analysis is a 404. The claim
    and review are committed together; a persistence failure rolls the
    transaction back and is reported as an error, never as success.

    ``payload.reviewer_id`` is stored as a self-reported label only: the shared
    bearer token does not identify an individual, so it is not verified identity.
    """
    analysis = repository.get_analysis(db, analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    try:
        review = repository.create_review(
            db,
            analysis=analysis,
            final_decision=payload.final_decision,
            # Self-reported, not verified: see the module docstring.
            reviewer_id=payload.reviewer_id,
            comments=payload.comments,
        )
        # Serialize while the ORM attributes are still fresh, then commit.
        body = _serialize_review(review, analysis)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception(
            "Failed to persist human review for analysis_id=%s", analysis_id
        )
        raise HTTPException(status_code=500, detail="The review could not be saved")

    return body


@router.get(
    "/analyses/{analysis_id}/reviews",
    response_model=list[db_schemas.ReviewDB],
)
def list_reviews(analysis_id: str, db: Session = Depends(database.get_db)):
    """Return the saved human reviews for an analysis, newest first."""
    analysis = repository.get_analysis(db, analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    reviews = repository.list_reviews_for_analysis(db, analysis.id)
    return [_serialize_review(review, analysis) for review in reviews]
