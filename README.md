# ClaimPilot AI

An AI-powered insurance claims intelligence platform designed to help claim officers assess and prioritize claims using ML-driven fraud probability, claim severity prediction, anomaly detection, risk scoring, and explainable recommendations.

## 🎯 Project Overview

ClaimPilot AI acts as an intelligent assistant for insurance claims teams - providing explainable insights to help prioritize claims efficiently while keeping human experts in the loop. The system identifies potentially suspicious claims, estimates expected claim amounts, assesses risk levels, and delivers clear explanations for its recommendations.

**Core Philosophy:** *Assist, don't replace.*

## 📊 Current Status

**Module 0 — Project Foundation** ✅

## 🏗️ Project Architecture

ClaimPilot AI follows a modular, production-style architecture with clear separation between experimentation and production code.

```text
ClaimPilot-AI/
│
├── data/           # Datasets (raw, processed, external)
├── notebooks/      # Exploratory analysis & experimentation
├── src/claimpilot/  # Reusable production code
├── scripts/        # Utility scripts
├── tests/          # Automated tests
├── models/         # Trained model artifacts
├── configs/        # Non-secret configuration
├── logs/           # Application logs
└── ...
```

## 🗺️ Planned Modules

| Module | Status | Description |
|---|---|---|
| **Module 0** | ✅ Complete | Project Foundation - Structure, Environment, Config, Logging |
| **Module 1** | ✅ Complete | Dataset & Data Understanding |
| **Module 2** | ✅ Complete | Exploratory Data Analysis (EDA) |
| **Module 3** | ✅ Complete | Data Cleaning & Feature Engineering |
| **Module 4** | ✅ Complete | Fraud Detection |
| **Module 5** | ✅ Complete | Claim Severity/Amount Prediction |
| **Module 6** | ✅ Complete | Anomaly Detection |
| **Module 7** | ✅ Complete | Risk Scoring |
| **Module 8** | ✅ Complete | Explainable AI |
| **Module 9** | ✅ Complete | Decision Engine |
| **Module 10** | ✅ Complete | Backend API |
| **Module 11** | ✅ Complete | Database Integration |
| **Module 12** | 📋 Planned | Frontend Dashboard |
| **Module 13** | 📋 Planned | Authentication & Roles |
| **Module 14** | 📋 Planned | Testing |
| **Module 15** | 📋 Planned | MLOps & Model Versioning |
| **Module 16** | 📋 Planned | Deployment |

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| **Core** | Python 3.12, Pandas, NumPy |
| **ML** | Scikit-learn, XGBoost, LightGBM (planned) |
| **XAI** | SHAP (planned) |
| **API** | FastAPI (planned) |
| **Database** | PostgreSQL/Supabase (planned) |
| **Frontend** | React/Next.js (planned) |
| **DevOps** | Docker (planned) |
| **Testing** | pytest |

## 🚀 Quick Start

### Prerequisites
- Python 3.12+
- Virtual environment (e.g., `.venv`)

### Setup

```bash
# Navigate to project directory
cd ClaimPilot

# Activate virtual environment
# Windows
.venv\Scripts\activate

# macOS/Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy environment variables
cp .env.example .env

# Run tests (uses an isolated local SQLite database, never the production one)
# Windows PowerShell: $env:PYTHONPATH = "src"
export PYTHONPATH=src
pytest

# Start the backend API (interactive docs at http://localhost:8000/docs)
# Windows PowerShell: $env:PYTHONPATH = "src"
export PYTHONPATH=src
python -m uvicorn backend.main:app --port 8000
```

## ⚙️ Configuration

Backend configuration is read from `.env` in the project root (copy `.env.example`; `.env` is git-ignored — never commit real credentials).

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | SQLAlchemy database URL — the single source of truth for the database target |
| `PYTHONPATH` | ✅ | Set to `src` so the backend and tests can import `claimpilot` |
| `APP_ENV` | — | Environment label (default `development`) |
| `LOG_LEVEL` | — | Logging verbosity (default `INFO`) |

**Supported database targets**

- **Local development / tests — SQLite:** `DATABASE_URL=sqlite:///./claimpilot.db`. No external service or driver required. The test suite forces its own isolated temp-file SQLite database before the app is imported, so tests never touch the production database.
- **PostgreSQL (e.g. Supabase):** use a `postgresql://` URL such as `postgresql+psycopg2://…` (see `.env.example`). The scheme token selects the driver, and both drivers are installed via `requirements.txt`: `postgresql+psycopg2://` → `psycopg2-binary`; a bare `postgresql://` URL (the SQLAlchemy 2.1 default) or explicit `postgresql+psycopg://` → `psycopg` (v3). Schema migrations live in `alembic/versions` and are applied with `alembic upgrade head`. Successfully constructing the engine proves driver compatibility only — it is not a connectivity test.

**Frontend:** the API base URL comes from `VITE_API_BASE_URL` (see `frontend/.env.example` and `frontend/README.md`). The backend currently sends no CORS headers, so for local development set it to an empty string **in `frontend/.env`** — requests then go through the Vite dev proxy (`/api` → `http://localhost:8000`). An empty *shell-level* variable is treated as unset by Vite, so use the `.env` file rather than exporting it. The frontend never hardcodes a backend URL.

**Local vs. production:** use SQLite + the Vite dev proxy locally; point `DATABASE_URL` at PostgreSQL/Supabase only when you intend to use that database.

## 📁 Directory Structure

| Directory | Purpose |
|---|---|
| `data/raw/` | Original, unmodified datasets |
| `data/processed/` | Cleaned and transformed datasets |
| `data/external/` | External reference data |
| `notebooks/` | Experimentation and analysis notebooks |
| `src/claimpilot/` | Reusable production Python code |
| `scripts/` | CLI utilities and automation scripts |
| `tests/` | Unit and integration tests |
| `models/` | Trained model artifacts (not committed) |
| `configs/` | Non-secret configuration files |
| `logs/` | Application and runtime logs |

## 🔒 Security Notes

- Never commit `.env` files or real secrets to version control
- Large datasets and model artifacts are gitignored
- All sensitive data handling will follow best practices as the project evolves

## 💡 Key Principles

- **Modular**: Clear separation of concerns across all modules
- **Explainable**: Every prediction includes human-readable explanations
- **Human-in-the-loop**: AI assists, humans make final decisions
- **Reproducible**: Consistent pipelines for training and inference
- **Production-ready**: Built with software engineering best practices

---

**Last Updated:** Module 0 - Project Foundation Complete
