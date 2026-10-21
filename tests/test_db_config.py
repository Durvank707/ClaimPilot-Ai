"""Phase 2 tests: database configuration, timeouts and schema management.

These never touch a real database. ``DATABASE_URL`` is a temporary SQLite file
(set by ``conftest.py``); configuration resolution is exercised by monkeypatching
the environment and ``APP_ENV``, and connectivity is tested against an isolated
temporary SQLite engine. No secret value is ever printed.
"""
import logging
import os
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import main as backend_main
from backend.config import settings
from backend.db import database, models


@pytest.fixture
def production(monkeypatch):
    monkeypatch.setattr(settings, "app_env", "production")


@pytest.fixture
def development(monkeypatch):
    monkeypatch.setattr(settings, "app_env", "development")


@pytest.fixture
def temp_engine(tmp_path):
    """An isolated temporary SQLite engine, disposed afterwards."""
    engine = create_engine(
        f"sqlite:///{tmp_path / 'p2.db'}",
        connect_args={"check_same_thread": False},
    )
    try:
        yield engine
    finally:
        engine.dispose()


# --- DATABASE_URL resolution -----------------------------------------------


def test_existing_url_is_used_verbatim(monkeypatch, development):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./explicit.db")
    assert database.resolve_database_url() == "sqlite:///./explicit.db"


def test_missing_url_fails_fast_in_production(monkeypatch, production):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(database.DatabaseConfigurationError) as excinfo:
        database.resolve_database_url()
    # The error is present and does not leak a URL or credentials.
    assert "DATABASE_URL is not set" in str(excinfo.value)
    assert "password" not in str(excinfo.value)


def test_missing_url_falls_back_to_sqlite_outside_production(
    monkeypatch, development, caplog
):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with caplog.at_level(logging.WARNING, logger="backend.db.database"):
        url = database.resolve_database_url()
    assert url == database.LOCAL_FALLBACK_URL
    assert url.startswith("sqlite:///")
    assert any("falling back" in r.getMessage() for r in caplog.records)


def test_blank_url_is_treated_as_missing(monkeypatch, development, caplog):
    monkeypatch.setenv("DATABASE_URL", "   ")
    with caplog.at_level(logging.WARNING, logger="backend.db.database"):
        url = database.resolve_database_url()
    assert url == database.LOCAL_FALLBACK_URL


def test_no_placeholder_postgres_fallback_exists():
    # The old fake DSN must be gone from the module entirely.
    source = Path(database.__file__).read_text(encoding="utf-8")
    assert "user:password@localhost" not in source


# --- connection timeout -----------------------------------------------------


def test_postgres_url_gets_a_connect_timeout():
    args = database._connect_args("postgresql+psycopg2://u:p@host:5432/db")
    assert args == {"connect_timeout": database.POSTGRES_CONNECT_TIMEOUT}


def test_postgres_psycopg3_url_gets_a_connect_timeout():
    args = database._connect_args("postgresql+psycopg://u:p@host:5432/db")
    assert args["connect_timeout"] == database.POSTGRES_CONNECT_TIMEOUT


def test_sqlite_url_gets_no_connect_args():
    assert database._connect_args("sqlite:///./claimpilot.db") == {}


def test_configured_engine_uses_the_default_url_without_timeout():
    # conftest points at SQLite, so no connect timeout should be applied.
    assert database.DATABASE_URL.startswith("sqlite:///")
    assert database.engine.dialect.name == "sqlite"


# --- connectivity check -----------------------------------------------------


def test_connectivity_true_for_a_reachable_engine(monkeypatch, temp_engine):
    monkeypatch.setattr(database, "engine", temp_engine)
    assert backend_main.check_database_connectivity() is True


def test_connectivity_false_and_logged_when_unreachable(monkeypatch, caplog):
    class BoomEngine:
        def connect(self):
            raise RuntimeError("simulated outage")

    monkeypatch.setattr(database, "engine", BoomEngine())
    with caplog.at_level(logging.ERROR, logger="backend.main"):
        assert backend_main.check_database_connectivity() is False
    assert any(
        r.exc_info is not None
        for r in caplog.records
        if r.name == "backend.main"
    )


# --- missing tables ---------------------------------------------------------


def test_missing_tables_reports_all_when_empty(monkeypatch, temp_engine):
    monkeypatch.setattr(database, "engine", temp_engine)
    missing = backend_main._missing_tables()
    assert set(missing) == set(backend_main.REQUIRED_TABLES)


def test_missing_tables_empty_after_create_all(monkeypatch, temp_engine):
    models.Base.metadata.create_all(bind=temp_engine)
    monkeypatch.setattr(database, "engine", temp_engine)
    assert backend_main._missing_tables() == []


# --- production schema management ------------------------------------------


def test_production_does_not_run_create_all(monkeypatch, production):
    """Production must never create the schema implicitly."""
    calls = {"count": 0}

    def forbidden(*args, **kwargs):
        calls["count"] += 1
        raise AssertionError("create_all must not run in production")

    monkeypatch.setattr(models.Base.metadata, "create_all", forbidden)
    monkeypatch.setattr(backend_main, "check_database_connectivity", lambda: True)
    monkeypatch.setattr(backend_main, "_missing_tables", lambda: ["claims"])
    monkeypatch.setattr(backend_main, "database_initialized", True)

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(backend_main.logger, "exception", lambda *a, **k: None)
        result = backend_main.initialize_database()

    assert result is False
    assert calls["count"] == 0
    assert backend_main.database_initialized is False


def test_production_ready_when_schema_present(monkeypatch, production):
    """Production initialization succeeds when tables already exist."""
    calls = {"count": 0}

    def forbidden(*args, **kwargs):
        calls["count"] += 1
        raise AssertionError("create_all must not run in production")

    monkeypatch.setattr(models.Base.metadata, "create_all", forbidden)
    monkeypatch.setattr(backend_main, "check_database_connectivity", lambda: True)
    monkeypatch.setattr(backend_main, "_missing_tables", list)
    monkeypatch.setattr(backend_main, "database_initialized", False)

    assert backend_main.initialize_database() is True
    assert calls["count"] == 0
    assert backend_main.database_initialized is True


def test_production_unreachable_database_is_not_initialized(monkeypatch, production, caplog):
    monkeypatch.setattr(backend_main, "check_database_connectivity", lambda: False)
    monkeypatch.setattr(backend_main, "database_initialized", True)

    with caplog.at_level(logging.ERROR, logger="backend.main"):
        result = backend_main.initialize_database()

    assert result is False
    assert backend_main.database_initialized is False
    assert any(
        "managed by Alembic" in r.getMessage() for r in caplog.records
    )


# --- local/test schema management stays intact -----------------------------


def test_local_initialization_still_creates_tables(monkeypatch, development, temp_engine):
    monkeypatch.setattr(database, "engine", temp_engine)
    monkeypatch.setattr(backend_main, "database_initialized", False)

    assert backend_main.initialize_database() is True
    assert backend_main.database_initialized is True
    assert backend_main._missing_tables() == []


def test_local_initialization_failure_is_logged_not_raised(
    monkeypatch, development, caplog
):
    def boom(bind=None):
        raise RuntimeError("simulated database unavailable")

    monkeypatch.setattr(models.Base.metadata, "create_all", boom)
    monkeypatch.setattr(backend_main, "database_initialized", True)

    with caplog.at_level(logging.ERROR, logger="backend.main"):
        assert backend_main.initialize_database() is False
    assert backend_main.database_initialized is False
    assert any("Database initialization failed" in r.getMessage() for r in caplog.records)
