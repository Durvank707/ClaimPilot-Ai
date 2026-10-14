from fastapi import APIRouter

router = APIRouter()

@router.get("/")
def root():
    return {"service": "ClaimPilot AI", "status": "running", "version": "1.0.0"}

@router.get("/health")
def health():
    return {"status": "healthy"}

@router.get("/ready")
def ready():
    try:
        from backend.dependencies import analyzer
        return {"status": "ready", "models_loaded": True}
    except Exception as e:
        return {"status": "not_ready", "models_loaded": False}
