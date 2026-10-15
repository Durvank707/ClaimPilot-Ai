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
from pydantic_settings import BaseSettings

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
    fraud_model_path: str = "models/fraud_model_v1.joblib"
    severity_model_path: str = "models/severity_model_v1.joblib"
    anomaly_model_path: str = "models/anomaly_model_v1.joblib"
    risk_config_path: str = "configs/risk_scoring.json"
    decision_policy_path: str = "configs/decision_policy.json"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
