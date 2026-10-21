"""Database engine and session configuration.

``DATABASE_URL`` is the single source of truth for the database target and is
resolved from the process environment (after the project-root ``.env`` is
loaded). There is **no placeholder fallback**: silently pointing at a fake
PostgreSQL DSN is worse than failing loudly.

Behaviour when ``DATABASE_URL`` is missing:

- production  -> raise a clear, secret-free :class:`DatabaseConfigurationError`
  so the process fails fast instead of appearing healthy.
- otherwise   -> fall back to a local SQLite file (``./claimpilot.db``) and log
  a warning, so local development keeps working without extra setup. Tests set
  ``DATABASE_URL`` before importing this module, so they are unaffected.

PostgreSQL connections use a bounded ``connect_timeout`` so an unreachable host
fails in seconds rather than hanging (psycopg/psycopg2 accept ``connect_timeout``
in seconds). SQLite needs no timeout argument.
"""
from __future__ import annotations

import logging
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from backend.config import load_project_env, settings

logger = logging.getLogger(__name__)

# Apply the project-root .env before DATABASE_URL is resolved so the value is
# available regardless of which module is imported first. Real process
# environment variables always take precedence over .env values.
load_project_env()

# Local development fallback. Deliberately SQLite (no external service) and
# never a placeholder network DSN with fake credentials.
LOCAL_FALLBACK_URL = "sqlite:///./claimpilot.db"

# Seconds to wait for a PostgreSQL connection before giving up.
POSTGRES_CONNECT_TIMEOUT = 5


class DatabaseConfigurationError(RuntimeError):
    """Raised when the database configuration is missing in production.

    The message never contains credentials or the URL itself.
    """


def _is_production() -> bool:
    return settings.is_production


def resolve_database_url() -> str:
    """Return the configured database URL, enforcing production requirements.

    Reads ``DATABASE_URL`` from the process environment. Raises
    :class:`DatabaseConfigurationError` when it is missing in production;
    otherwise returns the local SQLite fallback (with a warning).
    """
    url = os.getenv("DATABASE_URL")
    if url and url.strip():
        return url.strip()

    if _is_production():
        raise DatabaseConfigurationError(
            "DATABASE_URL is not set. A production deployment must configure a "
            "real database URL; refusing to fall back to a local SQLite file."
        )

    logger.warning(
        "DATABASE_URL is not set; falling back to the local SQLite database at "
        "%s. Set DATABASE_URL for any non-local environment.",
        LOCAL_FALLBACK_URL,
    )
    return LOCAL_FALLBACK_URL


def _connect_args(url: str) -> dict:
    """Dialect-specific ``create_engine`` connect arguments.

    Only PostgreSQL gets a connect timeout; SQLite (and unknown dialects) get
    none, so the local/test workflow is untouched.
    """
    if url.startswith("postgresql"):
        return {"connect_timeout": POSTGRES_CONNECT_TIMEOUT}
    return {}


DATABASE_URL = resolve_database_url()

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args=_connect_args(DATABASE_URL),
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
