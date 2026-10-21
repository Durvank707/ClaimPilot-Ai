"""Reliability tests for backend startup schema initialization (Step 4K).

These tests drive ``backend.main.initialize_database`` directly. They never
touch a real database: ``create_all`` is stubbed, and the shared test setup
(``conftest.py``) points ``DATABASE_URL`` at an isolated temporary SQLite file
before the application is imported.
"""
import logging

from backend import main as backend_main


def test_successful_initialization_returns_true_and_sets_flag(monkeypatch):
    """A successful create_all flips the flag to True and returns True."""
    called = {}

    def fake_create_all(bind=None):
        called["bind"] = bind

    monkeypatch.setattr(
        backend_main.models.Base.metadata, "create_all", fake_create_all
    )
    monkeypatch.setattr(backend_main, "database_initialized", False)

    result = backend_main.initialize_database()

    assert result is True
    assert backend_main.database_initialized is True
    # Initialization still targets the configured engine.
    assert called["bind"] is backend_main.database.engine


def test_initialization_failure_is_logged_and_observable(monkeypatch, caplog):
    """A failing create_all is logged with a traceback and leaves the flag False."""

    def boom(bind=None):
        raise RuntimeError("simulated database unavailable")

    monkeypatch.setattr(backend_main.models.Base.metadata, "create_all", boom)
    # Simulate a previously-healthy flag that must be reset by the failure.
    monkeypatch.setattr(backend_main, "database_initialized", True)

    with caplog.at_level(logging.ERROR, logger="backend.main"):
        result = backend_main.initialize_database()

    assert result is False
    assert backend_main.database_initialized is False

    records = [r for r in caplog.records if r.name == "backend.main"]
    assert any(r.levelno >= logging.ERROR for r in records)
    assert any("Database initialization failed" in r.getMessage() for r in records)
    # The underlying exception is attached, not swallowed silently.
    assert any(r.exc_info is not None for r in records), (
        "expected the initialization error to be logged with its traceback"
    )


def test_initialization_failure_does_not_raise(monkeypatch):
    """A failure must never propagate and crash application startup."""

    def boom(bind=None):
        raise RuntimeError("simulated database unavailable")

    monkeypatch.setattr(backend_main.models.Base.metadata, "create_all", boom)
    monkeypatch.setattr(backend_main, "database_initialized", False)

    # Must not raise.
    assert backend_main.initialize_database() is False
    assert backend_main.database_initialized is False


def test_app_import_initializes_database_successfully():
    """The shared temporary SQLite from conftest lets import-time init succeed."""
    assert backend_main.database_initialized is True
