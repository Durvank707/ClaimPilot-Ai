# ClaimPilot AI

An AI-powered insurance claims intelligence platform designed to help claim
officers assess and prioritize claims using ML-driven fraud probability, claim
severity prediction, anomaly detection, risk scoring, and explainable
recommendations.

## 🎯 Project Overview

ClaimPilot AI acts as an intelligent assistant for insurance claims teams -
providing explainable insights to help prioritize claims efficiently while
keeping human experts in the loop. The system identifies potentially suspicious
claims, estimates expected claim amounts, assesses risk levels, and delivers
clear explanations for its recommendations.

**Core Philosophy:** *Assist, don't replace.* Every prediction is decision
support: the API and UI never approve, reject or accuse, and every analysis
carries `human_decision_required: true`.

> **Reproducibility status.** The backend and frontend run from tracked code, but
> the trained model binaries and the processed dataset are **not** committed
> (they are large / third-party). A fresh checkout must obtain them before the
> backend will start. See [Model and data artifacts](#-model-and-data-artifacts).

## 🏗️ Architecture

```text
ClaimPilot/
├── backend/            # FastAPI app (routers, auth, db, services)
├── src/claimpilot/     # Reusable pipeline: models, features, risk, data
├── notebooks/          # Numbered pipeline scripts (EDA → preprocessing → training)
├── scripts/            # Utility scripts (evaluation)
├── tests/              # Backend test suite (pytest, isolated SQLite)
├── data/raw/           # Original dataset (gitignored)
├── data/processed/     # Cleaned/feature-engineered dataset (gitignored)
├── models/             # Trained model artifacts (gitignored)
├── configs/            # Non-secret risk/decision configuration (tracked)
├── alembic/            # Database migrations
├── docs/               # Per-module documentation
└── frontend/           # React + TypeScript + Vite dashboard
```

Request flow: `FastAPI router → ClaimAnalyzer service → models + risk scorer +
decision engine + explainer → persistence (SQLAlchemy)`.

## ✅ Requirements

| Component | Version |
|---|---|
| Python | 3.12+ (tested on 3.12.10) |
| Node.js | 20+ (frontend; tested on 20.12.1) |
| Database | SQLite (local/tests) or PostgreSQL (e.g. Supabase) |

Python dependencies are listed in `requirements.txt` (and `pyproject.toml`).
No system-level build tools are required: every dependency ships binary wheels.

## 🚀 Quick Start (backend)

```bash
cd ClaimPilot

# 1. Create and activate a virtual environment
python -m venv .venv
# Windows PowerShell
.venv\Scripts\Activate.ps1
# macOS/Linux
source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment (copy the template; .env is git-ignored)
cp .env.example .env          # Windows: Copy-Item .env.example .env

# 4. Obtain the model + data artifacts (see the dedicated section below),
#    or the backend will refuse to start with a clear error.

# 5. Ensure the package is importable (src layout)
#    Windows PowerShell: $env:PYTHONPATH = "src"
export PYTHONPATH=src

# 6. Apply database migrations (SQLite locally; never against production by accident)
alembic upgrade head

# 7. Start the API (interactive docs at http://localhost:8000/docs)
python -m uvicorn backend.main:app --port 8000
```

Health probes: `GET /api/v1/health` (liveness) and `GET /api/v1/ready`
(database + models + auth configuration).

## 🖥️ Quick Start (frontend)

```bash
cd frontend
npm install
cp .env.example .env          # Windows: Copy-Item .env.example .env
npm run dev                   # http://localhost:5173
```

See [`frontend/README.md`](frontend/README.md) for the API configuration
(development, same-origin/proxy and production).

## 📦 Model and data artifacts

Four kinds of artifacts are required for the backend to start and analyse claims.
**None of them is committed to Git** (`.gitignore` excludes `models/`,
`data/raw/`, `data/processed/`). A fresh checkout must obtain them.

| Artifact | Location | Needed for |
|---|---|---|
| Raw dataset | `data/raw/insurance_fraud_car.csv` | Preprocessing, retraining, model tests |
| Processed dataset | `data/processed/processed_all.csv` | Claim analysis (severity normalization), model tests |
| Trained models | `models/{fraud,severity,anomaly}_model_v1.joblib` | Backend startup + inference |
| Model metadata (optional) | `models/*_metadata.json` | Traceability (not loaded at runtime) |

Risk and decision configuration (`configs/risk_scoring.json`,
`configs/decision_policy.json`) **is** tracked, so no setup is needed there.

Each artifact path is configurable through the environment (see `.env.example`:
`FRAUD_MODEL_PATH`, `SEVERITY_MODEL_PATH`, `ANOMALY_MODEL_PATH`,
`RISK_CONFIG_PATH`, `DECISION_POLICY_PATH`, `DATA_PROCESSED_PATH`). Relative
paths resolve from the project root; absolute paths are used as-is, so a
deployment can mount an artifact store. When a required artifact is missing the
app **fails fast at startup** with a message naming the missing file(s).

### 1. Raw dataset

- **Source:** Kaggle — *Car Insurance Fraud Detection Dataset*
  ([`ahluwaliasaksham/car-insurance-fraud-detection-dataset`](https://www.kaggle.com/datasets/ahluwaliasaksham/car-insurance-fraud-detection-dataset)),
  a synthetic dataset (30,000 rows × 24 columns; no real customer data).
- **Expected file:** `data/raw/insurance_fraud_car.csv`.
- Full data dictionary and limitations: [`docs/dataset.md`](docs/dataset.md).

Download it from the source above and place it at that path. The raw file is
treated as **immutable**: nothing in the codebase writes to `data/raw/`.

### 2. Processed dataset

Generate it from the raw dataset with the tracked preprocessing pipeline
(feature engineering + cleaning + target encoding; see
[`docs/features.md`](docs/features.md)):

```bash
export PYTHONPATH=src        # Windows: $env:PYTHONPATH = "src"
python notebooks/03_feature_engineering.py
# writes data/processed/processed_all.csv
```

### 3. Trained models

The training pipeline is tracked as numbered scripts and **can regenerate
models of the same architecture**:

```bash
export PYTHONPATH=src        # Windows: $env:PYTHONPATH = "src"
python notebooks/04_fraud_detection.py       # -> models/fraud_model_v1.joblib
python notebooks/05_claim_severity.py        # -> models/severity_model_v1.joblib
python notebooks/06_anomaly_detection.py     # -> models/anomaly_model_v1.joblib
```

> **Provenance limitation (important).** The committed `models/*_v1.joblib`
> binaries were *not* produced by these scripts as written and their exact
> training configuration is not recorded. Inspecting the artifacts shows:
> fraud = `RandomForestClassifier(n_estimators=200)`, threshold `0.3`;
> severity = `LinearRegression`; anomaly = `IsolationForest(contamination=0.1)`.
> The scripts train on small samples, so regenerated binaries will **not**
> reproduce the current predictions exactly, and a different
> scikit-learn/XGBoost version will differ again. For parity with the deployed
> behaviour, provision the existing artifacts out of band (e.g. a secure
> artifact store) rather than treating "run the notebooks" as bit-exact
> reproduction. Do not present a regenerated model as equivalent to the
> committed one.

## ⚙️ Configuration

Backend configuration is read from `.env` in the project root (copy
`.env.example`; `.env` is git-ignored — never commit real credentials).

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | SQLAlchemy database URL — the single source of truth for the database target |
| `PYTHONPATH` | ✅ | Set to `src` so the backend and tests can import `claimpilot` |
| `APP_ENV` | — | Environment label (default `development`) |
| `LOG_LEVEL` | — | Logging verbosity (default `INFO`) |
| `API_AUTH_TOKEN` | — | Shared bearer token gating sensitive routers (see below) |
| `CORS_ALLOW_ORIGINS` | — | Comma-separated explicit browser origins |
| `*_MODEL_PATH`, `*_CONFIG_PATH`, `DATA_PROCESSED_PATH` | — | Artifact location overrides |

**Supported database targets**

- **Local development / tests — SQLite:** `DATABASE_URL=sqlite:///./claimpilot.db`.
  No external service or driver required. The test suite forces its own isolated
  temp-file SQLite database before the app is imported, so tests never touch the
  production database.
- **PostgreSQL (e.g. Supabase):** use a `postgresql://` URL such as
  `postgresql+psycopg2://…` (see `.env.example`). Both drivers
  (`psycopg2-binary`, `psycopg`) ship in `requirements.txt`. A missing
  `DATABASE_URL` fails fast in production; PostgreSQL connections use a bounded
  connect timeout.

**Schema management.** Production schema is owned by **Alembic**: run
`alembic upgrade head` as a deploy step. The app never runs `create_all` in
production (it only verifies connectivity and that the required tables exist).
Outside production, `create_all` runs at startup so a fresh checkout just works.

**Authentication.** `API_AUTH_TOKEN` is a **shared service token**, not an
individual reviewer identity — it proves a client is authorised, not *which*
human is calling. When set, protected routes require
`Authorization: Bearer <token>` (401 if missing, 403 if wrong). When unset, the
API runs unauthenticated outside production (with a warning) and fails readiness
in `APP_ENV=production`.

## 🧪 Tests, lint and build

**Backend (pytest, isolated temp SQLite):**

```bash
export PYTHONPATH=src        # Windows: $env:PYTHONPATH = "src"
pytest
```

Tests never touch a real database and never require the model binaries beyond
the local checkout.

**Frontend (Vitest, oxlint, production build):**

```bash
cd frontend
npm test          # run the suite once
npm run lint      # oxlint
npm run build     # tsc -b + vite build -> dist/
```

## 🧯 Common setup failures

| Symptom | Cause | Fix |
|---|---|---|
| `MissingArtifactsError: Required runtime artifact(s) are missing` | Models or processed dataset absent (gitignored) | Obtain them per [Model and data artifacts](#-model-and-data-artifacts) |
| `ModuleNotFoundError: No module named 'claimpilot'` | `src` not on `PYTHONPATH` | `export PYTHONPATH=src` (Windows `$env:PYTHONPATH = "src"`) |
| `ModuleNotFoundError: No module named 'backend'` | Running from the wrong directory | Run backend commands from the project root |
| `DatabaseConfigurationError: DATABASE_URL is not set` | Production without a DB URL | Set `DATABASE_URL`; production has no fallback |
| `alembic upgrade head` targets the wrong DB | Stale `DATABASE_URL` in the shell | Set `DATABASE_URL` explicitly before the command |
| Frontend shows *Backend unavailable* though the API is healthy | CORS / base URL | Use the Vite dev proxy (`VITE_API_BASE_URL=` in `frontend/.env`) or set `CORS_ALLOW_ORIGINS` |
| Model loads but predictions differ from the deployed app | Regenerated (not provisioned) model | Provision the original artifacts (see provenance note) |

## 🔒 Security Notes

- Never commit `.env` files or real secrets to version control.
- Large datasets and model artifacts are gitignored and provisioned separately.
- Frontend env vars (`VITE_*`) are bundled into the browser and are **visible to
  users** — never put a production secret such as `API_AUTH_TOKEN` in
  `VITE_API_TOKEN`. See [`frontend/README.md`](frontend/README.md).

## ⚠️ Current limitations

- **Model/data provenance:** the committed binaries cannot be bit-exactly
  regenerated from the tracked scripts (see the provenance note above).
- **Authentication:** the shared token provides client authorisation only, not
  per-reviewer identity or role-based access. Secure multi-user auth needs a
  backend proxy / identity provider and is a separate, approved change.
- **Human-in-the-loop:** unchanged — the system never auto-approves, rejects or
  accuses.

## 💡 Key Principles

- **Modular**: clear separation of concerns across all modules.
- **Explainable**: every prediction includes human-readable explanations.
- **Human-in-the-loop**: AI assists, humans make the final decision.
- **Reproducible**: tracked pipelines for preprocessing and training.
- **Production-ready**: built with software engineering best practices.

---

**Status:** Modules 0–11 complete (foundation → database integration) plus a
React dashboard and a Step 9 production-readiness review (auth, database
reliability, reproducibility).
