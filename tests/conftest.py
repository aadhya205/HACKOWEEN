"""Shared test state: no live LLM calls, no cache leakage between tests."""

from __future__ import annotations

import pytest

from app import config
from app.main import alert_cache
from app.ring_source import ring_cache


@pytest.fixture(autouse=True)
def isolated_state(monkeypatch):
    """Force keyless mode and empty caches before/after every test.

    Even if a developer has a real GEMINI_API_KEY or a running Ollama in
    .env, tests must never hit the network — both providers are stubbed in
    the explanation tests instead.
    """
    monkeypatch.setattr(config, "GEMINI_API_KEY", "")
    monkeypatch.setattr(config, "OLLAMA_ENABLED", False)
    # Tests must not depend on whether a developer happens to have
    # data/fake_alerts.json in the working tree: force the built-in rings.
    monkeypatch.setattr(config, "FAKE_ALERTS_PATH", "data/__absent_for_tests__.json")
    # Same for the trained artifacts: API tests assert the fake-alert
    # fallback, and detection.py is exercised separately.
    monkeypatch.setattr(
        config, "DETECTED_RINGS_PATH", "data/__absent_for_tests__/rings.json"
    )
    monkeypatch.setattr(
        config, "DETECTOR_METRICS_PATH", "data/__absent_for_tests__/metrics.json"
    )
    alert_cache.clear()
    ring_cache.clear()
    yield
    alert_cache.clear()
    ring_cache.clear()
