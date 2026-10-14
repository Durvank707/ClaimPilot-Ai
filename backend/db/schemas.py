from pydantic import BaseModel
from typing import Optional, Any, Dict
from datetime import datetime

class ClaimDB(BaseModel):
    id: int
    claim_id: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True

class AnalysisDB(BaseModel):
    id: int
    analysis_id: Optional[str] = None
    risk_score: Optional[float] = None
    risk_level: Optional[str] = None
    analyzed_at: datetime
    class Config:
        from_attributes = True

class ReviewDB(BaseModel):
    id: int
    review_id: Optional[str] = None
    final_decision: Optional[str] = None
    reviewed_at: datetime
    class Config:
        from_attributes = True
