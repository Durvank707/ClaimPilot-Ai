from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from backend.db.database import Base

class Claim(Base):
    __tablename__ = "claims"
    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(String(100), unique=True, index=True, nullable=True)
    policy_id = Column(String(100), index=True, nullable=True)
    claim_amount = Column(Float, nullable=True)
    incident_type = Column(String(100), nullable=True)
    incident_date = Column(String(100), nullable=True)
    policy_state = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    analyses = relationship("ClaimAnalysis", back_populates="claim")

class ClaimAnalysis(Base):
    __tablename__ = "claim_analyses"
    id = Column(Integer, primary_key=True, index=True)
    analysis_id = Column(String(100), unique=True, index=True, nullable=True)
    claim_id_fk = Column(Integer, ForeignKey("claims.id"), nullable=True)
    fraud_probability = Column(Float, nullable=True)
    predicted_claim_amount = Column(Float, nullable=True)
    anomaly_score = Column(Float, nullable=True)
    risk_score = Column(Float, nullable=True)
    risk_level = Column(String(50), nullable=True)
    explanation = Column(JSON, nullable=True)
    recommendation = Column(JSON, nullable=True)
    triggered_rules = Column(JSON, nullable=True)
    policy_versions = Column(JSON, nullable=True)
    analyzed_at = Column(DateTime, default=datetime.utcnow)
    claim = relationship("Claim", back_populates="analyses")
    reviews = relationship("HumanReview", back_populates="analysis")

class HumanReview(Base):
    __tablename__ = "human_reviews"
    id = Column(Integer, primary_key=True, index=True)
    review_id = Column(String(100), unique=True, index=True, nullable=True)
    analysis_id_fk = Column(Integer, ForeignKey("claim_analyses.id"), nullable=True)
    claim_id_fk = Column(Integer, ForeignKey("claims.id"), nullable=True)
    reviewer_id = Column(String(100), nullable=True)
    final_decision = Column(String(100), nullable=True)
    comments = Column(Text, nullable=True)
    reviewed_at = Column(DateTime, default=datetime.utcnow)
    analysis = relationship("ClaimAnalysis", back_populates="reviews")
