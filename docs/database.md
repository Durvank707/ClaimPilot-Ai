# Database Integration (Module 11)

## Schema
- claims: claim metadata
- claim_analyses: analysis results (JSON for explanation/recommendation)
- human_reviews: review records

## Config
DATABASE_URL from .env (never commit real values)

## Migrations
alembic used; migrations in alembic/versions

## Endpoints
GET /api/v1/claims/{claim_id}, GET /api/v1/analyses/{analysis_id}

## Notes
Persistence added to /claims/analyze. Uses SQLAlchemy 2.x; tests can use SQLite.
