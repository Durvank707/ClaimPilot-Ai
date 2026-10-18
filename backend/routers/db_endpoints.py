from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from backend.db import database, repository, schemas as db_schemas
from backend.db import models as db_models

router = APIRouter()

def _serialize_claim(c: "db_models.Claim") -> Dict[str, Any]:
    """Persisted claim details (no internal primary key)."""
    return {
        "claim_id": c.claim_id,
        "policy_id": c.policy_id,
        "created_at": c.created_at,
        "policy_state": c.policy_state,
        "claim_amount": c.claim_amount,
        "incident_type": c.incident_type,
        "incident_date": c.incident_date,
    }

@router.get("/claims/{claim_id}", response_model=db_schemas.ClaimDB)
def get_claim(claim_id: str, db: Session = Depends(database.get_db)):
    c = repository.get_claim(db, claim_id)
    if not c: raise HTTPException(status_code=404, detail="Claim not found")
    return _serialize_claim(c)

def _serialize_analysis_summary(a: "db_models.ClaimAnalysis") -> Dict[str, Any]:
    """Lightweight history row: scalar fields plus the recommendation label.

    The full explanation/decision payloads are intentionally not included.
    """
    recommendation = None
    if isinstance(a.recommendation, dict):
        candidate = a.recommendation.get("recommendation")
        if isinstance(candidate, str):
            recommendation = candidate
    return {
        "analysis_id": a.analysis_id,
        "analyzed_at": a.analyzed_at,
        "fraud_probability": a.fraud_probability,
        "predicted_claim_amount": a.predicted_claim_amount,
        "anomaly_score": a.anomaly_score,
        "risk_score": a.risk_score,
        "risk_level": a.risk_level,
        "recommendation": recommendation,
    }

def _serialize_analysis(a: "db_models.ClaimAnalysis") -> Dict[str, Any]:
    """Rebuild the nested analysis contract from persisted columns only.

    This is a pure read: it never touches the ML analyzer. Values that were not
    stored are returned as null rather than invented.
    """
    explanation = a.explanation if isinstance(a.explanation, dict) else None

    # The full decision payload was persisted in the `recommendation` column.
    decision = a.recommendation if isinstance(a.recommendation, dict) else None

    # Risk breakdown (component values) was persisted inside the explanation.
    components = None
    if explanation is not None:
        risk_explanation = explanation.get("risk")
        if isinstance(risk_explanation, dict):
            candidate = risk_explanation.get("components")
            if isinstance(candidate, dict):
                components = candidate

    claim = a.claim
    return {
        "analysis_id": a.analysis_id,
        "claim_id": claim.claim_id if claim is not None else None,
        "analyzed_at": a.analyzed_at,
        "fraud": {"probability": a.fraud_probability},
        "severity": {"predicted_claim_amount": a.predicted_claim_amount},
        "anomaly": {"score": a.anomaly_score},
        "risk": {
            "score": a.risk_score,
            "level": a.risk_level,
            "components": components,
        },
        "explanation": explanation,
        "decision": decision,
    }

@router.get("/analyses/{analysis_id}", response_model=db_schemas.AnalysisDB)
def get_analysis(analysis_id: str, db: Session = Depends(database.get_db)):
    a = repository.get_analysis(db, analysis_id)
    if not a: raise HTTPException(status_code=404, detail="Analysis not found")
    return _serialize_analysis(a)

@router.get("/claims/{claim_id}/analyses", response_model=db_schemas.ClaimAnalysisHistoryDB)
def get_claim_analyses(
    claim_id: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(database.get_db),
):
    c = repository.get_claim(db, claim_id)
    if not c:
        raise HTTPException(status_code=404, detail="Claim not found")
    total = repository.count_analyses_for_claim(db, c.id)
    rows: List[db_models.ClaimAnalysis] = repository.list_analyses_for_claim(
        db, c.id, limit=limit, offset=offset, descending=(order == "desc")
    )
    return {
        "items": [_serialize_analysis_summary(a) for a in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }
