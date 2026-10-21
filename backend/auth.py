"""Bearer-token authentication gate for the sensitive API routers.

Design (Phase 1 of the production-readiness work):

- A single shared secret, ``API_AUTH_TOKEN``, gates every router that exposes or
  mutates claim, analysis, review or dashboard data.
- When the token **is** configured, a request must present it as
  ``Authorization: Bearer <token>``. Missing credentials are ``401``; a present
  but wrong token is ``403``. Both responses carry a fixed, secret-free message.
- When the token is **not** configured the gate is only tolerated outside
  production: in ``APP_ENV=production`` a missing token is a fatal
  misconfiguration reported by :func:`enforce_configuration` (and readiness
  fails), so a production deployment cannot silently run unprotected.

The comparison uses :func:`hmac.compare_digest` so token checking does not leak
timing information. The token value is never logged and never placed in a
response body.

Scope note: this gate authenticates the *client*, not an individual reviewer.
A shared token cannot prove *which* human recorded a review, so it must never be
presented as verified individual identity (see ``backend/routers/reviews.py``).
"""
from __future__ import annotations

import hmac
import logging
from typing import Optional

from fastapi import HTTPException, Request

from backend.config import settings

logger = logging.getLogger(__name__)

# Fixed, secret-free messages. They never echo the supplied or configured token.
_MISSING_CREDENTIALS = "Authentication credentials were not provided"
_INVALID_CREDENTIALS = "Authentication credentials are invalid"

_BEARER_PREFIX = "bearer "


def configured_token() -> Optional[str]:
    """The configured bearer token, or ``None`` when auth is not configured.

    Read live from settings so a test (or a restarted process) that changes the
    environment is honoured without re-importing this module. An empty/whitespace
    value is treated as "not configured".
    """
    token = settings.api_auth_token
    if token is None:
        return None
    token = token.strip()
    return token or None


def is_auth_enforced() -> bool:
    """Whether requests must currently present the bearer token."""
    return configured_token() is not None


def _extract_bearer(header: Optional[str]) -> Optional[str]:
    """Return the bearer token from an ``Authorization`` header, or ``None``.

    Accepts the scheme case-insensitively (``Bearer``/``bearer``) and returns the
    raw remainder so the caller can compare it in constant time.
    """
    if not header:
        return None
    if header[: len(_BEARER_PREFIX)].lower() != _BEARER_PREFIX:
        return None
    return header[len(_BEARER_PREFIX):]


def verify_bearer_token(
    authorization: Optional[str], expected: Optional[str]
) -> bool:
    """Constant-time check that ``authorization`` carries the expected token.

    ``expected`` must be a non-empty token; when auth is not configured callers
    should skip this check entirely (see :func:`require_bearer_token`).
    """
    if not expected:
        return False
    presented = _extract_bearer(authorization)
    if presented is None:
        return False
    return hmac.compare_digest(presented, expected)


async def require_bearer_token(request: Request) -> None:
    """FastAPI dependency that enforces the bearer token when configured.

    Raises ``401`` when no credential is supplied and ``403`` when a credential
    is supplied but wrong. When the token is not configured, the dependency
    allows the request through (production absence is handled by
    :func:`enforce_configuration`, which prevents the app from starting).
    """
    expected = configured_token()
    if expected is None:
        return

    header = request.headers.get("authorization")
    if header is None or header.strip() == "":
        raise HTTPException(
            status_code=401,
            detail=_MISSING_CREDENTIALS,
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not verify_bearer_token(header, expected):
        raise HTTPException(
            status_code=403,
            detail=_INVALID_CREDENTIALS,
            headers={"WWW-Authenticate": "Bearer"},
        )


def enforce_configuration() -> bool:
    """Validate the auth configuration for the current environment.

    Returns ``True`` when the configuration is safe for the current environment
    and ``False`` when the process must treat itself as not-ready (production
    without a token). Never aborts the process itself, so a misconfiguration is
    observable through readiness rather than a silent insecure start. The token
    value, if any, is never logged.
    """
    if configured_token() is not None:
        return True
    if settings.is_production:
        logger.error(
            "API_AUTH_TOKEN is not set while APP_ENV=production. Protected "
            "endpoints must not run unauthenticated in production; refusing to "
            "report the service as ready."
        )
        return False
    logger.warning(
        "API_AUTH_TOKEN is not set. The API is running WITHOUT authentication "
        "outside production. Set API_AUTH_TOKEN before deploying."
    )
    return True


__all__ = [
    "configured_token",
    "enforce_configuration",
    "is_auth_enforced",
    "require_bearer_token",
    "verify_bearer_token",
]
