from pydantic import BaseModel
from typing import Optional, List

class ClaimRequest(BaseModel):
    policy_id: Optional[str] = None
    policy_state: Optional[str] = None
    policy_deductible: Optional[int] = None
    policy_annual_premium: Optional[float] = None
    insured_age: Optional[int] = None
    insured_sex: Optional[str] = None
    insured_education_level: Optional[str] = None
    insured_occupation: Optional[str] = None
    incident_date: Optional[str] = None
    incident_type: Optional[str] = None
    collision_type: Optional[str] = None
    incident_severity: Optional[str] = None
    authorities_contacted: Optional[str] = None
    incident_state: Optional[str] = None
    incident_city: Optional[str] = None
    incident_hour_of_the_day: Optional[int] = None
    number_of_vehicles_involved: Optional[int] = None
    bodily_injuries: Optional[int] = None
    witnesses: Optional[int] = None
    police_report_available: Optional[str] = None
    claim_amount: Optional[float] = None

class ClaimResponse(BaseModel):
    claim_id: Optional[str] = None
    fraud: dict
    severity: dict
    anomaly: dict
    risk: dict
    explanation: dict
    decision: dict
    # Step 2: persistence status. `analysis_id` is the UUID of the stored
    # analysis record (None when persistence failed); `persisted` reports
    # whether the claim and analysis were committed together.
    analysis_id: Optional[str] = None
    persisted: bool = False
