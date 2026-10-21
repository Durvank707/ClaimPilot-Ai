"""FastAPI application entry point.

Schema initialization is best-effort and environment-aware:

- In production the schema is owned by Alembic (``alembic upgrade head``); the
  app never runs ``create_all`` there, it only verifies connectivity and that the
  required tables exist.
- Outside production ``create_all`` runs so a fresh checkout works immediately.

Either way a database failure is logged (never swallowed) and recorded in
``database_initialized`` instead of being silently ignored: the API still starts
(analysis runs and honestly reports ``persisted=False``).
"""
import logging
from typing import Optional

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend import auth
from backend.config import settings
from backend.routers import health, claims, db_endpoints, reviews, dashboard
from backend.db import models, database

logger = logging.getLogger(__name__)

app = FastAPI(title="ClaimPilot AI API", version="1.0.0")

# Whether table initialization succeeded. Starts False and only becomes True
# once ``initialize_database`` confirms the tables were created, so a failed
# initialization is never mistaken for a healthy persistence layer.
database_initialized = False

# Whether the authentication configuration is safe for this environment. Only
# False in production when ``API_AUTH_TOKEN`` is missing; readiness reflects it
# and the process still starts so the misconfiguration is observable rather than
# silently insecure.
auth_configured = auth.enforce_configuration()

def configure_cors(target: FastAPI, origins: Optional[list[str]] = None) -> list[str]:
    """Attach CORS middleware for explicit origins and return the origins used.

    Credentials are never combined with the wildcard origin: a ``"*"`` entry is
    dropped with an error instead of being passed through. When no explicit
    origins remain, no middleware is added (same-origin and the dev proxy keep
    working). ``origins`` defaults to the configured setting and is only passed
    explicitly by tests.
    """
    resolved = list(settings.cors_origins if origins is None else origins)
    if "*" in resolved:
        logger.error(
            'CORS_ALLOW_ORIGINS must list explicit origins; the wildcard "*" is '
            "not allowed with credentials and has been ignored."
        )
        resolved = [origin for origin in resolved if origin != "*"]
    if resolved:
        target.add_middleware(
            CORSMiddleware,
            allow_origins=resolved,
            allow_credentials=True,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type", "Accept"],
        )
    return resolved


def register_routers(target: FastAPI) -> None:
    """Register every router, gating the sensitive ones behind bearer auth.

    Health probes stay public: liveness/readiness must be reachable without
    credentials and they expose no claim, analysis or review data. Every router
    that exposes or mutates sensitive data is gated consistently by the shared
    bearer-token dependency.
    """
    target.include_router(health.router, prefix="/api/v1")
    target.include_router(
        claims.router,
        prefix="/api/v1/claims",
        dependencies=[Depends(auth.require_bearer_token)],
    )
    target.include_router(
        db_endpoints.router,
        prefix="/api/v1",
        dependencies=[Depends(auth.require_bearer_token)],
    )
    target.include_router(
        reviews.router,
        prefix="/api/v1",
        dependencies=[Depends(auth.require_bearer_token)],
    )
    target.include_router(
        dashboard.router,
        prefix="/api/v1",
        dependencies=[Depends(auth.require_bearer_token)],
    )


configure_cors(app)
register_routers(app)

# Tables the application needs to persist claims, analyses and reviews. Mirrors
# the Alembic migration (``alembic/versions/345946f9551e_init.py``).
REQUIRED_TABLES = ("claims", "claim_analyses", "human_reviews")


def check_database_connectivity() -> bool:
    """Whether a lightweight query succeeds against the configured database.

    Opens a real connection and runs ``SELECT 1``. Never raises: any failure is
    logged (without connection secrets) and reported as ``False``. Used by
    readiness so a reachable-but-uninitialized database is not reported ready.
    """
    try:
        with database.engine.connect() as connection:
            connection.exec_driver_sql("SELECT 1")
        return True
    except Exception:
        logger.exception("Database connectivity check failed.")
        return False


def _missing_tables() -> list[str]:
    """Required tables absent from the configured database.

    Raises on inspection failure (the caller treats that as not-initialized).
    """
    from sqlalchemy import inspect

    inspector = inspect(database.engine)
    existing = set(inspector.get_table_names())
    return [name for name in REQUIRED_TABLES if name not in existing]


def initialize_database() -> bool:
    """Prepare the schema, honouring the environment's schema-management rules.

    - **Production:** schema changes must go through Alembic
      (``alembic upgrade head``). ``create_all`` is deliberately **not** run:
      it cannot alter existing tables and would silently drift from the
      migrations. Instead this verifies connectivity and that the required
      tables already exist, so a missing schema is reported rather than created.
    - **Anywhere else (local/test):** ``create_all`` runs as before so a fresh
      checkout works without a migration step.

    Returns True when the database is usable and False otherwise. Failures are
    logged with their traceback (never a secret) and never propagate, so the API
    still starts and honestly reports ``persisted=False``.
    """
    global database_initialized

    if settings.is_production:
        try:
            if not check_database_connectivity():
                raise RuntimeError("database is not reachable")
            missing = _missing_tables()
            if missing:
                # Do not create it here: production schema is owned by Alembic.
                raise RuntimeError(
                    "missing tables: " + ", ".join(missing) + " (run 'alembic upgrade head')"
                )
        except Exception:
            database_initialized = False
            logger.exception(
                "Database initialization failed in production. The schema is "
                "managed by Alembic; run 'alembic upgrade head' and ensure the "
                "database is reachable. The API will start but cannot persist."
            )
            return False
        database_initialized = True
        return True

    try:
        models.Base.metadata.create_all(bind=database.engine)
    except Exception:
        database_initialized = False
        logger.exception(
            "Database initialization failed: tables could not be created. "
            "The API will start, but analyses cannot be persisted."
        )
        return False
    database_initialized = True
    return True


initialize_database()
