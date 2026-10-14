import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_health():
    r = client.get("/api/v1/health")
    assert r.status_code == 200

def test_analyze():
    payload = {"claim_amount": 5000, "incident_type": "Parked Car"}
    r = client.get("/api/v1/health")  # warm
    r = client.post("/api/v1/claims/analyze", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert "fraud" in data
    assert "decision" in data
    assert data["decision"]["human_decision_required"] is True
