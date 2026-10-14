from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.db import database, repository, schemas as db_schemas

router = APIRouter()

@router.get("/claims/{claim_id}", response_model=db_schemas.ClaimDB)
def get_claim(claim_id: str, db: Session = Depends(database.get_db)):
    c = repository.get_claim(db, claim_id)
    if not c: raise HTTPException(status_code=404, detail="Claim not found")
    return c

@router.get("/analyses/{analysis_id}", response_model=db_schemas.AnalysisDB)
def get_analysis(analysis_id: str, db: Session = Depends(database.get_db)):
    a = repository.get_analysis(db, analysis_id)
    if not a: raise HTTPException(status_code=404, detail="Analysis not found")
    return a
