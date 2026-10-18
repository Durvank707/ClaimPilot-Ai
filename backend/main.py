from fastapi import FastAPI
from backend.routers import health, claims, db_endpoints
from backend.db import models, database
import os

app = FastAPI(title="ClaimPilot AI API", version="1.0.0")

# Create tables for dev/test if needed
try:
    models.Base.metadata.create_all(bind=database.engine)
except Exception:
    pass

app.include_router(health.router, prefix="/api/v1")
app.include_router(claims.router, prefix="/api/v1/claims")
app.include_router(db_endpoints.router, prefix="/api/v1")