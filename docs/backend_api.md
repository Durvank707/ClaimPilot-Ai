# ClaimPilot AI — Backend API (Module 10)

## 1. Purpose
Expose ClaimPilot intelligence pipeline via FastAPI. Endpoints: GET /, GET /api/v1/health, GET /api/v1/ready, POST /api/v1/claims/analyze.

## 2. Architecture
FastAPI -> routers -> ClaimAnalyzer service -> Modules 3–9 (models, risk, decision, explainability). Models loaded once at startup.

## 3. Request/Response
Request: claim fields (as per feature sets). Response includes fraud/severity/anomaly/risk/explanation/decision with human_decision_required true.

## 4. Manual Test
Health returns 200; analyze returns full structured response.

## 5. Tests
API tests pass (health + analyze). All existing tests still pass.

## Conclusion
Module 10 complete.
