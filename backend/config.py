from pydantic_settings import BaseSettings
from pathlib import Path

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
