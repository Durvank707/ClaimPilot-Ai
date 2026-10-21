from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, Any, Dict, List
from datetime import datetime

# The only human review outcomes the platform accepts. Each one is a decision a
# human reviewer explicitly records; the system never selects one on its own and
# never approves, rejects or accuses a claim automatically.
REVIEW_OUTCOMES = ("APPROVED", "REJECTED", "NEEDS_MORE_INFO", "ESCALATED")

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

class ReviewCreate(BaseModel):
    """A human reviewer's decision for one stored analysis.

    ``final_decision`` is required and validated against ``REVIEW_OUTCOMES`` so
    an unsupported outcome is rejected with 422. ``reviewer_id`` and ``comments``
    are optional. The reviewer remains responsible for the decision.
    """

    final_decision: str
    reviewer_id: Optional[str] = None
    comments: Optional[str] = None

    @field_validator("final_decision")
    @classmethod
    def _validate_final_decision(cls, value: str) -> str:
        if value not in REVIEW_OUTCOMES:
            raise ValueError(
                "final_decision must be one of: " + ", ".join(REVIEW_OUTCOMES)
            )
        return value


class ReviewDB(BaseModel):
    """A persisted human review, reconstructed from stored columns only.

    The internal integer primary key is intentionally not exposed. ``analysis_id``
    and ``claim_id`` are the public identifiers of the associated records, when
    available.
    """

    model_config = ConfigDict(from_attributes=True)

    review_id: Optional[str] = None
    final_decision: Optional[str] = None
    reviewer_id: Optional[str] = None
    comments: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    analysis_id: Optional[str] = None
    claim_id: Optional[str] = None


class DashboardTotalsDB(BaseModel):
    """Persisted record counts. ``analyses`` is not a count of unique claims."""
    claims: int = 0
    analyses: int = 0
    reviews: int = 0


class DashboardRiskDistributionDB(BaseModel):
    """Persisted analyses grouped by risk level. Unrecognised values fold into
    ``UNKNOWN`` rather than being dropped."""
    LOW: int = 0
    MEDIUM: int = 0
    HIGH: int = 0
    CRITICAL: int = 0
    UNKNOWN: int = 0


class DashboardReviewOutcomeCountsDB(BaseModel):
    """Counts keyed by the accepted human review outcomes, plus ``UNKNOWN``."""
    APPROVED: int = 0
    REJECTED: int = 0
    NEEDS_MORE_INFO: int = 0
    ESCALATED: int = 0
    UNKNOWN: int = 0


class DashboardRecentAnalysisDB(BaseModel):
    """One lightweight row of recent activity (no explanation/decision payload)."""
    analysis_id: Optional[str] = None
    claim_id: Optional[str] = None
    analyzed_at: Optional[datetime] = None
    fraud_probability: Optional[float] = None
    predicted_claim_amount: Optional[float] = None
    anomaly_score: Optional[float] = None
    risk_score: Optional[float] = None
    risk_level: Optional[str] = None
    recommendation: Optional[str] = None


class DashboardRiskReviewStatusRowDB(BaseModel):
    """Per-analysis counts for one risk bucket.

    ``total`` is the number of analyses in the bucket, ``reviewed`` the number
    with at least one review record, and ``awaiting_review`` the remainder.
    These are analyses, never review records.
    """
    total: int = 0
    awaiting_review: int = 0
    reviewed: int = 0


class DashboardRiskReviewStatusDB(BaseModel):
    """Review status per risk bucket (analyses, not review records)."""
    LOW: "DashboardRiskReviewStatusRowDB" = Field(
        default_factory=DashboardRiskReviewStatusRowDB
    )
    MEDIUM: "DashboardRiskReviewStatusRowDB" = Field(
        default_factory=DashboardRiskReviewStatusRowDB
    )
    HIGH: "DashboardRiskReviewStatusRowDB" = Field(
        default_factory=DashboardRiskReviewStatusRowDB
    )
    CRITICAL: "DashboardRiskReviewStatusRowDB" = Field(
        default_factory=DashboardRiskReviewStatusRowDB
    )
    UNKNOWN: "DashboardRiskReviewStatusRowDB" = Field(
        default_factory=DashboardRiskReviewStatusRowDB
    )


class DashboardRecentReviewDB(BaseModel):
    """One human-review *record* (not a unique reviewed analysis)."""
    review_id: Optional[str] = None
    final_decision: Optional[str] = None
    reviewer_id: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    analysis_id: Optional[str] = None
    claim_id: Optional[str] = None
    risk_level: Optional[str] = None


class DashboardReviewQueueItemDB(BaseModel):
    """One prioritised analysis in the human-review worklist.

    Includes read-only claim context (incident type and amount) to help a
    reviewer triage, plus review-record counts. No internal primary key is
    exposed and no automatic decision is implied.
    """
    analysis_id: Optional[str] = None
    claim_id: Optional[str] = None
    analyzed_at: Optional[datetime] = None
    risk_score: Optional[float] = None
    risk_level: Optional[str] = None
    fraud_probability: Optional[float] = None
    predicted_claim_amount: Optional[float] = None
    anomaly_score: Optional[float] = None
    recommendation: Optional[str] = None
    review_count: int = 0
    latest_review_outcome: Optional[str] = None
    latest_reviewed_at: Optional[datetime] = None
    incident_type: Optional[str] = None
    claim_amount: Optional[float] = None


class DashboardReviewQueueDB(BaseModel):
    """One page of the review queue. ``total`` is the full match count."""
    items: List[DashboardReviewQueueItemDB] = Field(default_factory=list)
    total: int = 0
    limit: int = 10
    offset: int = 0


class DashboardSummaryDB(BaseModel):
    """Aggregated dashboard metrics, all computed from persisted records.

    ``review_outcomes`` counts review *records*; ``latest_review_outcomes``
    counts *analyses* by the outcome of their most recently recorded review.
    ``risk_review_status`` and ``recent_reviews`` extend the original payload
    additively and do not change the meaning of any existing field.
    """
    totals: DashboardTotalsDB = Field(default_factory=DashboardTotalsDB)
    high_critical_analyses: int = 0
    analyses_with_reviews: int = 0
    analyses_awaiting_review: int = 0
    risk_distribution: DashboardRiskDistributionDB = Field(
        default_factory=DashboardRiskDistributionDB
    )
    review_outcomes: DashboardReviewOutcomeCountsDB = Field(
        default_factory=DashboardReviewOutcomeCountsDB
    )
    latest_review_outcomes: DashboardReviewOutcomeCountsDB = Field(
        default_factory=DashboardReviewOutcomeCountsDB
    )
    recent_analyses: List[DashboardRecentAnalysisDB] = Field(default_factory=list)
    risk_review_status: DashboardRiskReviewStatusDB = Field(
        default_factory=DashboardRiskReviewStatusDB
    )
    recent_reviews: List[DashboardRecentReviewDB] = Field(default_factory=list)
    oldest_awaiting_analyzed_at: Optional[datetime] = None
