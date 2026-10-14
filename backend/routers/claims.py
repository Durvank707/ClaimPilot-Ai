from fastapi import APIRouter
from backend.schemas import ClaimRequest, ClaimResponse
from backend.dependencies import analyzer

router = APIRouter()

@router.post("/analyze", response_model=ClaimResponse)
def analyze(req: ClaimRequest):
    return analyzer.analyze(req.model_dump(exclude_none=True))
