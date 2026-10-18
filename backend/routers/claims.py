import logging

from fastapi import APIRouter, Depends
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from backend.schemas import ClaimRequest, ClaimResponse
from backend.dependencies import analyzer
from backend.db import database, repository

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/analyze", response_model=ClaimResponse)
def analyze(req: ClaimRequest, db: Session = Depends(database.get_db)):
    data = req.model_dump(exclude_none=True)
    res = analyzer.analyze(data)
    # Persistence status defaults to "not saved"; it is only flipped to True
    # after the transaction commits successfully.
    res["analysis_id"] = None
    res["persisted"] = False
    try:
        # The repository helpers only flush. This route owns the transaction so
        # the claim and its analysis are committed together, or not at all.
        claim = repository.get_or_create_claim(db, data)
        analysis = repository.create_analysis(db, claim.id, res)
        claim_id = claim.claim_id
        # Take the identifier produced by the persistence operation itself.
        analysis_id = analysis.analysis_id
        db.commit()
        res["claim_id"] = claim_id
        res["analysis_id"] = analysis_id
        res["persisted"] = True
    except SQLAlchemyError:
        # Persistence failed: roll the whole transaction back so a newly created
        # claim is never left behind, log it, and still return the analysis
        # result (graceful degradation). The session is closed by get_db.
        db.rollback()
        logger.exception(
            "Failed to persist claim analysis for claim_id=%s; "
            "returning analysis result without persistence.",
            res.get("claim_id"),
        )
    return res