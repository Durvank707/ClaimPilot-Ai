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
| **Module 9** | 📋 Planned | Decision/Recommendation Engine |
| **Module 10** | 📋 Planned | Backend API (FastAPI) |
| **Module 11** | 📋 Planned | Database (PostgreSQL/Supabase) |
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

# Run tests
pytest
```

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
