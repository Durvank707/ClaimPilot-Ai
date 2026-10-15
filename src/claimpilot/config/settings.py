import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv


def get_project_root() -> Path:
    """Get the ClaimPilot project root directory."""
    return Path(__file__).resolve().parents[3]


class Settings:
    """Centralized configuration for ClaimPilot AI."""

    def __init__(self) -> None:
        self.project_root = get_project_root()
        load_dotenv(self.project_root / ".env", override=False)

        self.app_env = os.getenv("APP_ENV", "development")
        self.log_level = os.getenv("LOG_LEVEL", "INFO")

        self.data_dir = self.project_root / "data"
        self.raw_data_dir = self.data_dir / "raw"
        self.processed_data_dir = self.data_dir / "processed"
        self.external_data_dir = self.data_dir / "external"

        self.models_dir = self.project_root / "models"
        self.configs_dir = self.project_root / "configs"
        self.logs_dir = self.project_root / "logs"
        self.notebooks_dir = self.project_root / "notebooks"
        self.scripts_dir = self.project_root / "scripts"

        for dir_path in [
            self.data_dir,
            self.raw_data_dir,
            self.processed_data_dir,
            self.external_data_dir,
            self.models_dir,
            self.configs_dir,
            self.logs_dir,
        ]:
            dir_path.mkdir(parents=True, exist_ok=True)


def get_settings() -> Settings:
    """Return a singleton-like settings instance."""
    return Settings()


settings = get_settings()

__all__ = ["Settings", "get_settings", "settings", "get_project_root"]
