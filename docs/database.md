# Database Integration (Module 11)

## Schema
- claims: claim metadata
- claim_analyses: analysis results (JSON for explanation/recommendation)
- human_reviews: review records

## Config
- `DATABASE_URL` from the process environment / `.env` (never commit real values).
- There is **no placeholder fallback**: a missing `DATABASE_URL` fails fast in
  `APP_ENV=production` and falls back to local SQLite (`./claimpilot.db`) with a
  warning otherwise.
- PostgreSQL connections use a bounded `connect_timeout`
  (`POSTGRES_CONNECT_TIMEOUT`, default 5s) so an unreachable host fails fast
  instead of hanging.

## Migrations
- Schema changes are owned by Alembic; migrations live in `alembic/versions`.
- **Production must run `alembic upgrade head` as a deploy step.** The app never
  calls `create_all` in production; it only verifies connectivity and that the
  required tables exist (readiness reflects a missing schema).
- Outside production, `create_all` runs at startup so a fresh local checkout
  works without a migration step. Tests use isolated temporary SQLite.

## Endpoints
GET /api/v1/claims/{claim_id}, GET /api/v1/analyses/{analysis_id}

## Notes
Persistence added to /claims/analyze. Uses SQLAlchemy 2.x; tests can use SQLite.
`GET /api/v1/health` is liveness (no dependencies). `GET /api/v1/ready` reports
database initialization/connectivity, model availability and auth configuration.
