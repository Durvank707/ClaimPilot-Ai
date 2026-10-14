from fastapi import FastAPI
from backend.routers import health, claims

app = FastAPI(title="ClaimPilot AI API", version="1.0.0")

app.include_router(health.router, prefix="/api/v1")
app.include_router(claims.router, prefix="/api/v1/claims")
