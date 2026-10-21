"""Tests for the Phase 1 bearer-token gate and CORS configuration.

Scope:
- protected routers reject missing credentials (401) and wrong credentials (403),
  and accept the configured token (200/201);
- health probes stay public;
- the gate is disabled (with a warning) when no token is configured outside
  production, and production without a token is a fatal misconfiguration;
- CORS is applied only for explicit origins and never for the wildcard.

These use the shared temporary SQLite fixtures from ``conftest.py`` and never
contact a real database. The token value is a test placeholder, never a secret.
"""
import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth
from backend import main as backend_main
from backend.config import settings

TOKEN = "test-token-do-not-use-in-production"
BEARER = {"Authorization": f"Bearer {TOKEN}"}

# One representative endpoint per protected router.
CLAIMS_URL = "/api/v1/claims/analyze"
DB_READ_URL = "/api/v1/claims/DOES-NOT-EXIST"
REVIEWS_URL = "/api/v1/analyses/does-not-exist/reviews"
DASHBOARD_URL = "/api/v1/dashboard/summary"
PUBLIC_URLS = ("/api/v1/", "/api/v1/health", "/api/v1/ready")


@pytest.fixture
def with_token(monkeypatch):
    """Configure a token for the duration of a test."""
    monkeypatch.setattr(auth.settings, "api_auth_token", TOKEN)
    return TOKEN


@pytest.fixture
def without_token(monkeypatch):
    """Ensure no token is configured (the suite default)."""
    monkeypatch.setattr(auth.settings, "api_auth_token", None)


# --- token configuration helpers -------------------------------------------


def test_configured_token_treats_blank_as_unset(monkeypatch):
    monkeypatch.setattr(auth.settings, "api_auth_token", "   ")
    assert auth.configured_token() is None
    assert auth.is_auth_enforced() is False


def test_configured_token_strips_whitespace(monkeypatch):
    monkeypatch.setattr(auth.settings, "api_auth_token", f"  {TOKEN}  ")
    assert auth.configured_token() == TOKEN
    assert auth.is_auth_enforced() is True


@pytest.mark.parametrize(
    "header,expected",
    [
        (None, False),
        ("", False),
        ("Bearer", False),
        ("Bearer ", False),
        ("Basic abc", False),
        (f"bearer {TOKEN}", True),  # scheme is case-insensitive
        (f"Bearer {TOKEN}", True),
        (f"Bearer {TOKEN}x", False),
        (f"Bearer  {TOKEN}", False),  # extra space is part of the token
        ("Bearer wrong", False),
    ],
)
def test_verify_bearer_token(header, expected):
    assert auth.verify_bearer_token(header, TOKEN) is expected


def test_verify_bearer_token_rejects_empty_expected():
    assert auth.verify_bearer_token(f"Bearer {TOKEN}", None) is False
    assert auth.verify_bearer_token(f"Bearer {TOKEN}", "") is False


# --- enforcement configuration ---------------------------------------------


def test_enforce_configuration_ok_when_token_set(monkeypatch):
    monkeypatch.setattr(auth.settings, "api_auth_token", TOKEN)
    monkeypatch.setattr(auth.settings, "app_env", "production")
    assert auth.enforce_configuration() is True


def test_enforce_configuration_warns_outside_production(monkeypatch, caplog):
    monkeypatch.setattr(auth.settings, "api_auth_token", None)
    monkeypatch.setattr(auth.settings, "app_env", "development")
    with caplog.at_level(logging.WARNING, logger="backend.auth"):
        assert auth.enforce_configuration() is True
    assert any("WITHOUT authentication" in r.getMessage() for r in caplog.records)


def test_enforce_configuration_fails_in_production_without_token(
    monkeypatch, caplog
):
    monkeypatch.setattr(auth.settings, "api_auth_token", None)
    monkeypatch.setattr(auth.settings, "app_env", "production")
    with caplog.at_level(logging.ERROR, logger="backend.auth"):
        assert auth.enforce_configuration() is False
    # The error must not leak a token value (there is none) — just the message.
    assert any("APP_ENV=production" in r.getMessage() for r in caplog.records)


# --- protected endpoints ----------------------------------------------------


@pytest.mark.parametrize("url", [CLAIMS_URL, DB_READ_URL, DASHBOARD_URL])
def test_protected_endpoint_requires_credentials(client, with_token, url):
    response = client.get(url) if url != CLAIMS_URL else client.post(url, json={})
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"
    assert TOKEN not in response.text


def test_reviews_endpoint_requires_credentials(client, with_token):
    response = client.get(REVIEWS_URL)
    assert response.status_code == 401


@pytest.mark.parametrize("url", [DB_READ_URL, DASHBOARD_URL])
def test_protected_endpoint_rejects_wrong_token(client, with_token, url):
    response = client.get(url, headers={"Authorization": "Bearer not-the-token"})
    assert response.status_code == 403
    assert "not-the-token" not in response.text


def test_reviews_create_requires_credentials(client, with_token):
    response = client.post(
        REVIEWS_URL, json={"final_decision": "APPROVED"}
    )
    assert response.status_code == 401


def test_valid_token_reaches_the_endpoint(client, with_token):
    # The token is accepted; the endpoint then runs and returns its normal
    # result (404 here because the claim does not exist).
    response = client.get(DB_READ_URL, headers=BEARER)
    assert response.status_code == 404


def test_valid_token_allows_dashboard_read(client, with_token, sqlite_db):
    response = client.get(DASHBOARD_URL, headers=BEARER)
    assert response.status_code == 200
    assert "totals" in response.json()


def test_health_probes_stay_public(client, with_token):
    for url in PUBLIC_URLS:
        assert client.get(url).status_code == 200


def test_gate_is_open_when_token_unconfigured(client, without_token, sqlite_db):
    # Outside production an unconfigured token leaves the API reachable so the
    # existing development/test workflow is preserved.
    assert client.get(DASHBOARD_URL).status_code == 200


def test_response_never_echoes_token_header_value(client, with_token):
    response = client.get(DB_READ_URL, headers={"Authorization": "Bearer secret-value"})
    assert response.status_code == 403
    assert "secret-value" not in response.text
    assert "secret-value" not in str(response.headers)


# --- CORS -------------------------------------------------------------------


def _client_with_cors(origins):
    """A minimal app with the real CORS configuration applied."""
    test_app = FastAPI()
    backend_main.configure_cors(test_app, origins=origins)

    @test_app.get("/ping")
    def ping():
        return {"ok": True}

    return TestClient(test_app)


def test_cors_allows_configured_origin():
    client = _client_with_cors(["http://localhost:5173"])
    response = client.get("/ping", headers={"Origin": "http://localhost:5173"})
    assert (
        response.headers.get("access-control-allow-origin")
        == "http://localhost:5173"
    )
    assert response.headers.get("access-control-allow-credentials") == "true"


def test_cors_omits_header_for_disallowed_origin():
    client = _client_with_cors(["http://localhost:5173"])
    response = client.get("/ping", headers={"Origin": "https://evil.example.com"})
    assert "access-control-allow-origin" not in response.headers


def test_cors_preflight_allows_authorization_header():
    client = _client_with_cors(["http://localhost:5173"])
    response = client.options(
        "/ping",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert response.status_code == 200
    allow_headers = response.headers.get("access-control-allow-headers", "").lower()
    assert "authorization" in allow_headers


def test_cors_wildcard_is_rejected(caplog):
    with caplog.at_level(logging.ERROR, logger="backend.main"):
        resolved = backend_main.configure_cors(FastAPI(), origins=["*"])
    assert resolved == []
    assert any("wildcard" in r.getMessage() for r in caplog.records)


def test_cors_disabled_when_no_origins():
    client = _client_with_cors([])
    response = client.get("/ping", headers={"Origin": "http://localhost:5173"})
    assert "access-control-allow-origin" not in response.headers


def test_settings_cors_origins_parsing(monkeypatch):
    monkeypatch.setattr(settings, "cors_allow_origins", " a , , b ,c ")
    assert settings.cors_origins == ["a", "b", "c"]
    monkeypatch.setattr(settings, "cors_allow_origins", "")
    assert settings.cors_origins == []
