import uuid
from sqlalchemy.orm import Session
from backend.db import models

def get_or_create_claim(db: Session, claim_data: dict):
    cid = claim_data.get("policy_id") or claim_data.get("claim_id") or str(uuid.uuid4())
    c = db.query(models.Claim).filter(models.Claim.claim_id == cid).first()
    if not c:
        c = models.Claim(claim_id=cid, policy_id=claim_data.get("policy_id"), claim_amount=claim_data.get("claim_amount"), incident_type=claim_data.get("incident_type"), incident_date=claim_data.get("incident_date"), policy_state=claim_data.get("policy_state"))
        db.add(c); db.commit(); db.refresh(c)
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
    db.add(a); db.commit(); db.refresh(a)
    return a

def get_claim(db: Session, claim_id: str):
    return db.query(models.Claim).filter(models.Claim.claim_id == claim_id).first()

def get_analysis(db: Session, analysis_id: str):
    return db.query(models.ClaimAnalysis).filter(models.ClaimAnalysis.analysis_id == analysis_id).first()
