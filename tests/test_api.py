"""Endpoint tests: shared-format contract, caching, lookup, health.

Uses FastAPI's TestClient — in-process, no server, no network.
"""

from __future__ import annotations

import json
import re

from fastapi.testclient import TestClient

from app import config
from app.main import alert_cache, app
from app.ring_source import ring_cache

client = TestClient(app)

REQUIRED_ALERT_KEYS = {
    "ring_id",
    "accounts",
    "edges",
    "total_amount",
    "risk",
    "explanation",
}


def test_health_reports_template_mode_in_tests():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    # conftest forces keyless mode, so the template layer is active.
    assert body["llm"] == "template"


def test_alerts_matches_the_shared_format():
    response = client.get("/alerts")
    assert response.status_code == 200
    body = response.json()

    assert body["source"] == "fake"  # no Person 1 detection module yet
    assert body["count"] == len(body["alerts"]) >= 2

    alert = body["alerts"][0]
    assert REQUIRED_ALERT_KEYS <= set(alert.keys())

    # The frontend reads edges as {from, to, amount} — alias must survive.
    edge_json = json.dumps(alert["edges"])
    assert '"from"' in edge_json and '"to"' in edge_json

    assert isinstance(alert["risk"], int) and 0 <= alert["risk"] <= 100
    assert len([s for s in re.split(r"(?<=[.!?])\s+", alert["explanation"]) if s]) == 2
    assert alert["explanation_source"] in {"gemini", "ollama", "template"}

    # Explainability: the breakdown must add up to the score it explains.
    breakdown = alert["score_breakdown"]
    assert len(breakdown) >= 5
    assert abs(sum(row["contribution"] for row in breakdown) - alert["risk"]) <= 0.6


def test_planted_ring_is_the_high_risk_one():
    alerts = client.get("/alerts").json()["alerts"]
    by_id = {alert["ring_id"]: alert for alert in alerts}
    assert by_id["R1"]["risk"] >= 85
    assert by_id["R2"]["risk"] < by_id["R1"]["risk"]


def test_second_request_is_served_from_cache():
    first = client.get("/alerts").json()
    second = client.get("/alerts").json()
    assert first["cached"] is False
    assert second["cached"] is True
    # Cached alerts keep the explanation they were first given.
    assert second["alerts"][0]["explanation"] == first["alerts"][0]["explanation"]
    assert second["alerts"][0]["generated_at"] == first["alerts"][0]["generated_at"]


def test_caches_are_populated():
    client.get("/alerts")
    assert len(alert_cache) >= 2
    assert len(ring_cache) == 1


def test_single_alert_lookup():
    assert client.get("/alerts/R1").status_code == 200
    missing = client.get("/alerts/NOPE")
    assert missing.status_code == 404


def test_cors_allows_frontend_origin():
    response = client.get(
        "/alerts", headers={"Origin": "http://localhost:5173"}
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") in {"*", "http://localhost:5173"}


def test_docs_are_served():
    response = client.get("/docs")
    assert response.status_code == 200
    assert "swagger" in response.text.lower()


def _ring_artifact(path, ring_id="PS-999"):
    path.write_text(
        json.dumps(
            {
                "generated_at": "2026-10-24T00:00:00Z",
                "source": {"dataset": "PaySim", "rows_scanned": 6362620},
                "rings": [
                    {
                        "ring_id": ring_id,
                        "accounts": ["A1", "A2", "A3"],
                        "edges": [
                            {"from": "A1", "to": "A3", "amount": 8000},
                            {"from": "A2", "to": "A3", "amount": 7900},
                        ],
                        "total_amount": 15900,
                        "time_window_seconds": 120,
                        "new_accounts": 3,
                        "pattern": "fan-in to collection account",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )


def test_detected_ring_artifact_is_served(tmp_path, monkeypatch):
    artifact = tmp_path / "rings.json"
    _ring_artifact(artifact)
    monkeypatch.setattr(config, "DETECTED_RINGS_PATH", str(artifact))
    ring_cache.clear()
    alert_cache.clear()

    body = client.get("/alerts").json()
    assert body["source"] == "detection"
    assert body["count"] == 1
    assert body["alerts"][0]["ring_id"] == "PS-999"
    assert body["alerts"][0]["risk"] > 0
    assert body["detection_error"] is None


def test_model_endpoint_publishes_the_detector_report(tmp_path, monkeypatch):
    report = {
        "generated_at": "2026-10-24T00:00:00Z",
        "dataset": {"rows_scanned": 6362620, "frauds": 8213},
        "test": {
            "pr_auc": 0.99,
            "roc_auc": 0.99,
            "at_thresholds": [
                {"precision": 0.98, "recall": 0.97, "threshold": 0.3}
            ],
        },
        "ring_threshold": 0.98,
    }
    path = tmp_path / "metrics.json"
    path.write_text(json.dumps(report), encoding="utf-8")
    monkeypatch.setattr(config, "DETECTOR_METRICS_PATH", str(path))

    response = client.get("/model")
    assert response.status_code == 200
    assert response.json()["dataset"]["rows_scanned"] == 6362620

    health = client.get("/health").json()
    assert health["detector"]["pr_auc"] == 0.99
    assert health["detector"]["rows_scanned"] == 6362620


def test_model_endpoint_explains_a_missing_artifact(monkeypatch):
    monkeypatch.setattr(
        config, "DETECTOR_METRICS_PATH", "data/__absent_for_tests__/metrics.json"
    )
    response = client.get("/model")
    assert response.status_code == 503
    assert "train_detector.py" in response.json()["detail"]
