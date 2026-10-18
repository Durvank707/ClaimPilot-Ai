from pydantic import BaseModel, Field
from typing import Optional, Any, Dict, List
from datetime import datetime

class ClaimDB(BaseModel):
    """Persisted claim details. The internal integer primary key is not exposed."""
    claim_id: Optional[str] = None
    policy_id: Optional[str] = None
    created_at: Optional[datetime] = None
    policy_state: Optional[str] = None
    claim_amount: Optional[float] = None
    incident_type: Optional[str] = None
    incident_date: Optional[str] = None

class AnalysisFraudDB(BaseModel):
    probability: Optional[float] = None

class AnalysisSeverityDB(BaseModel):
    predicted_claim_amount: Optional[float] = None

class AnalysisAnomalyDB(BaseModel):
    score: Optional[float] = None

class AnalysisRiskDB(BaseModel):
    score: Optional[float] = None
    level: Optional[str] = None
    components: Optional[Dict[str, Any]] = None

class AnalysisDB(BaseModel):
    """A previously persisted analysis, reconstructed from stored columns only.

    Mirrors the nested shape returned by `POST /api/v1/claims/analyze` so the
    dashboard can render a saved analysis without rerunning ML inference. Fields
    that were never persisted are null rather than fabricated. The internal
    integer primary key is intentionally not exposed.
    """
    analysis_id: Optional[str] = None
    claim_id: Optional[str] = None
    analyzed_at: Optional[datetime] = None
    fraud: "AnalysisFraudDB" = Field(default_factory=AnalysisFraudDB)
    severity: "AnalysisSeverityDB" = Field(default_factory=AnalysisSeverityDB)
    anomaly: "AnalysisAnomalyDB" = Field(default_factory=AnalysisAnomalyDB)
    risk: "AnalysisRiskDB" = Field(default_factory=AnalysisRiskDB)
    explanation: Optional[Dict[str, Any]] = None
    decision: Optional[Dict[str, Any]] = None

class AnalysisSummaryDB(BaseModel):
    """Lightweight analysis row for the claim history list.

    Deliberately excludes the full explanation/decision payloads and the
    internal integer primary key.
    """
    analysis_id: Optional[str] = None
    analyzed_at: Optional[datetime] = None
    fraud_probability: Optional[float] = None
    predicted_claim_amount: Optional[float] = None
    anomaly_score: Optional[float] = None
    risk_score: Optional[float] = None
    risk_level: Optional[str] = None
    recommendation: Optional[str] = None

class ClaimAnalysisHistoryDB(BaseModel):
    """Paginated list of analyses belonging to a single claim."""
    items: List["AnalysisSummaryDB"] = Field(default_factory=list)
    total: int = 0
    limit: int = 20
    offset: int = 0

class ReviewDB(BaseModel):
    id: int
    review_id: Optional[str] = None
    final_decision: Optional[str] = None
    reviewed_at: datetime
    class Config:
        from_attributes = True
