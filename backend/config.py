"""Backend configuration.

The project-root ``.env`` file is loaded once into the process environment by
:func:`load_project_env`, so configuration is honoured no matter which module is
imported first. Variables already present in the process environment always take
precedence over ``.env`` values (``override=False``).
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional, Union

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/config.py -> parents[0] == backend/, parents[1] == project root.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = PROJECT_ROOT / ".env"

_env_loaded = False


def load_project_env(
    env_file: Optional[Union[str, Path]] = None, *, force: bool = False
) -> Path:
    """Load a ``.env`` file into ``os.environ`` without overriding real env vars.

    With no argument the project-root ``.env`` (``ENV_FILE``) is loaded at most
    once per process. An explicit path is always loaded, so callers and tests can
    target a temporary file without touching the real ``.env``. Returns the path
    that was considered.
    """
    global _env_loaded
    target = Path(env_file) if env_file is not None else ENV_FILE
    if env_file is None and _env_loaded and not force:
        return target
    if target.is_file():
        load_dotenv(target, override=False)
    if env_file is None:
        _env_loaded = True
    return target


class Settings(BaseSettings):
    app_name: str = "ClaimPilot AI"
    app_version: str = "1.0.0"
    # Artifact locations, resolvable through the environment so a deployment can
    # point at a mounted artifact store without editing code. Relative paths are
    # resolved from the project root (see ``resolve_artifact_path``).
    fraud_model_path: str = "models/fraud_model_v1.joblib"
    severity_model_path: str = "models/severity_model_v1.joblib"
    anomaly_model_path: str = "models/anomaly_model_v1.joblib"
    risk_config_path: str = "configs/risk_scoring.json"
    decision_policy_path: str = "configs/decision_policy.json"
    # Processed reference dataset used to normalize the predicted claim amount.
    data_processed_path: str = "data/processed/processed_all.csv"

    # Environment label ("development", "production", ...). Used only to decide
    # whether a missing authentication token is a fatal misconfiguration.
    app_env: str = "development"

    # Shared bearer token that gates the sensitive API routers. This is a
    # service-to-service secret, not an individual reviewer identity: it proves a
    # caller is an authorised client, not *which* human is calling.
    #
    # Empty/None means the token is not configured. Enforcement then depends on
    # ``app_env`` (see ``backend.auth``): absent outside production the API warns
    # and serves unprotected; absent in production it fails fast.
    api_auth_token: Optional[str] = None

    # Comma-separated list of browser origins allowed by CORS (explicit origins
    # only — never "*" together with credentials). Empty means no CORS is added,
    # which preserves same-origin and dev-proxy usage.
    cors_allow_origins: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def is_production(self) -> bool:
        """True only when ``APP_ENV`` explicitly names production."""
        return self.app_env.strip().lower() == "production"

    @property
    def cors_origins(self) -> list[str]:
        """The configured CORS origins, split on commas and stripped.

        Blank entries are dropped. The wildcard ``*`` is rejected by the caller
        in :mod:`backend.main` rather than here, so a misconfiguration is loud.
        """
        return [
            origin.strip()
            for origin in self.cors_allow_origins.split(",")
            if origin.strip()
        ]


settings = Settings()


def resolve_artifact_path(path: Union[str, Path]) -> Path:
    """Resolve an artifact path to an absolute path.

    Absolute paths are returned unchanged (so an environment variable can point
    at a mounted artifact store); relative paths are anchored to the project
    root, matching the defaults above (``models/...``, ``configs/...``,
    ``data/processed/...``) regardless of the current working directory.
    """
    candidate = Path(path)
    return candidate if candidate.is_absolute() else PROJECT_ROOT / candidate
