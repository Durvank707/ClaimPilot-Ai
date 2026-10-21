"""Phase 2 tests: liveness vs readiness semantics.

``/health`` is liveness and must stay independent of dependencies. ``/ready``
must reflect database initialization/connectivity, model availability and
required configuration, and must never report ready when a dependency failed.

The shared temporary SQLite fixtures come from ``conftest.py``; nothing here
contacts a real database or loads real model binaries (the analyzer is faked).
"""
import logging

import pytest

from backend import auth
from backend import main as backend_main
from backend.routers import health as health_router

READY_URL = "/api/v1/ready"
HEALTH_URL = "/api/v1/health"
LIVE_URL = "/api/v1/"


@pytest.fixture
def deps_ok(monkeypatch):
    """All readiness dependencies healthy and auth enabled."""
    monkeypatch.setattr(health_router, "_models_loaded", lambda: True)
    monkeypatch.setattr(backend_main, "check_database_connectivity", lambda: True)
    monkeypatch.setattr(backend_main, "database_initialized", True)
    monkeypatch.setattr(auth.settings, "api_auth_token", "configured-token")


# --- liveness stays independent --------------------------------------------


def test_liveness_does_not_touch_dependencies(client, monkeypatch):
    """/health answers even when every dependency is broken."""

    def boom(*args, **kwargs):
        raise AssertionError("liveness must not touch the database")

    monkeypatch.setattr(backend_main, "check_database_connectivity", boom)
    monkeypatch.setattr(health_router, "_models_loaded", boom)
    monkeypatch.setattr(backend_main, "database_initialized", False)

    assert client.get(HEALTH_URL).status_code == 200
    assert client.get(HEALTH_URL).json() == {"status": "healthy"}
    assert client.get(LIVE_URL).status_code == 200


# --- readiness happy path ---------------------------------------------------


def test_ready_when_all_dependencies_hold(client, deps_ok):
    response = client.get(READY_URL)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["models_loaded"] is True
    assert body["database_initialized"] is True
    assert body["auth_configured"] is True


# --- readiness failure modes ------------------------------------------------


def test_not_ready_when_database_unreachable(client, deps_ok, monkeypatch):
    monkeypatch.setattr(backend_main, "check_database_connectivity", lambda: False)
    body = client.get(READY_URL).json()
    assert body["status"] == "not_ready"
    assert body["database_initialized"] is False


def test_not_ready_when_database_never_initialized(client, deps_ok, monkeypatch):
    monkeypatch.setattr(backend_main, "database_initialized", False)
    body = client.get(READY_URL).json()
    assert body["status"] == "not_ready"
    assert body["database_initialized"] is False


def test_not_ready_when_models_missing(client, deps_ok, monkeypatch):
    monkeypatch.setattr(health_router, "_models_loaded", lambda: False)
    body = client.get(READY_URL).json()
    assert body["status"] == "not_ready"
    assert body["models_loaded"] is False


def test_not_ready_in_production_without_token(client, deps_ok, monkeypatch):
    monkeypatch.setattr(auth.settings, "api_auth_token", None)
    monkeypatch.setattr(auth.settings, "app_env", "production")
    body = client.get(READY_URL).json()
    assert body["status"] == "not_ready"
    assert body["auth_configured"] is False


# --- unit-level readiness helpers ------------------------------------------


def test_models_loaded_true_for_the_real_analyzer():
    # In the test environment the analyzer is constructed from the local models.
    assert health_router._models_loaded() is True


def test_models_loaded_false_when_component_missing(monkeypatch):
    from backend import dependencies

    class Partial:
        fraud = object()
        sev = object()
        anom = object()
        scorer = object()
        de = None  # missing dependency
        explainer = object()

    monkeypatch.setattr(dependencies, "analyzer", Partial())
    assert health_router._models_loaded() is False


def test_database_ready_false_when_connectivity_lost(monkeypatch):
    monkeypatch.setattr(backend_main, "database_initialized", True)
    monkeypatch.setattr(backend_main, "check_database_connectivity", lambda: False)
    assert health_router._database_ready() is False


def test_database_ready_true_when_initialized_and_reachable(monkeypatch):
    monkeypatch.setattr(backend_main, "database_initialized", True)
    monkeypatch.setattr(backend_main, "check_database_connectivity", lambda: True)
    assert health_router._database_ready() is True


def test_readiness_failure_is_logged_without_secrets(caplog, monkeypatch):
    class BoomEngine:
        def connect(self):
            raise RuntimeError("simulated outage")

    from backend.db import database

    monkeypatch.setattr(database, "engine", BoomEngine())
    with caplog.at_level(logging.ERROR, logger="backend.main"):
        assert backend_main.check_database_connectivity() is False
    # A traceback is attached; no connection URL leaks into the message.
    records = [r for r in caplog.records if r.name == "backend.main"]
    assert any(r.exc_info is not None for r in records)
    assert all("password" not in r.getMessage() for r in records)


# --- public behaviour is preserved -----------------------------------------


def test_health_and_ready_need_no_credentials(client, deps_ok):
    # Public probes must remain reachable while the sensitive routers are gated.
    assert client.get(HEALTH_URL).status_code == 200
    assert client.get(READY_URL).status_code == 200
