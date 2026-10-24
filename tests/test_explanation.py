"""Explanation layers: template (keyless), guardrail, and Gemini behaviour.

Gemini itself is stubbed via app.explanation._call_gemini — these tests
never touch the network.
"""

from __future__ import annotations

import asyncio
import json
import re

import httpx

from app import config
from app.explanation import (
    build_facts_payload,
    clean_reply,
    explain_ring,
    extract_numbers,
    guardrail,
    template_explanation,
)
from app.fake_rings import planted_ring


def run(coro):
    return asyncio.run(coro)


def sentences(text: str) -> list[str]:
    return [part for part in re.split(r"(?<=[.!?])\s+", text.strip()) if part]


def test_keyless_mode_uses_template():
    explanation, source = run(explain_ring(planted_ring(), 93))
    assert source == "template"
    assert len(sentences(explanation)) == 2
    # The template must only state facts we actually have.
    assert "7" in explanation  # new accounts
    assert "48,000" in explanation  # total moved
    assert "93" in explanation  # the score itself


def test_template_only_uses_numbers_from_the_payload():
    facts = planted_ring()
    payload = build_facts_payload(facts, 93)
    text = template_explanation(facts, 93, payload)
    allowed = extract_numbers(json.dumps(payload))
    for value in extract_numbers(text):
        assert any(abs(value - allowed_value) < 0.011 for allowed_value in allowed), (
            f"template invented {value}"
        )


def test_guardrail_rejects_a_hallucinated_number():
    payload = build_facts_payload(planted_ring(), 93)
    assert guardrail("The ring moved 48,000 in 110 seconds.", payload) is True
    assert guardrail("The ring moved 48,000,000 in 110 seconds.", payload) is False
    # 42 appears nowhere in the payload (7 does — it's num_new_accounts —
    # so the guardrail correctly allows it).
    assert guardrail("It happened on day 42 of the investigation.", payload) is False


def test_guardrail_accepts_comma_formatting_and_rounding():
    payload = build_facts_payload(planted_ring(), 93)
    # Same value, thousands separator -> still the same number.
    assert guardrail("A total of 48,000 was moved onward.", payload) is True
    # 1.8 minutes is in the payload (rounded), so it passes.
    assert guardrail("Within 1.8 minutes the money was gone.", payload) is True


def test_gemini_reply_passes_guardrail_is_used(monkeypatch):
    facts = planted_ring()
    risk = 93
    payload = build_facts_payload(facts, risk)

    async def fake_gemini(received):
        assert received == payload, "prompt must be the facts payload"
        return (
            f"{payload['num_new_accounts']} first-time receiver accounts split "
            f"{payload['total_amount']:,.0f} into near-identical amounts within "
            f"{payload['time_window_minutes']} minutes. A score of "
            f"{payload['risk_score_0_to_100']} out of {payload['score_max']} means "
            "a human analyst should review it now."
        )

    monkeypatch.setattr(config, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr("app.explanation._call_gemini", fake_gemini)

    explanation, source = run(explain_ring(facts, risk))
    assert source == "gemini"
    assert len(sentences(explanation)) == 2


def test_hallucinated_gemini_reply_falls_back_to_template(monkeypatch):
    async def fake_gemini(payload):
        return "The ring moved 7,300,000 through 19 accounts yesterday."

    monkeypatch.setattr(config, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr("app.explanation._call_gemini", fake_gemini)

    explanation, source = run(explain_ring(planted_ring(), 93))
    assert source == "template"
    assert "7,300,000" not in explanation


def test_timeout_falls_back_to_template(monkeypatch):
    async def slow_gemini(payload):
        raise httpx.ConnectTimeout("simulated dead Wi-Fi")

    monkeypatch.setattr(config, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr("app.explanation._call_gemini", slow_gemini)

    explanation, source = run(explain_ring(planted_ring(), 93))
    assert source == "template"
    assert len(sentences(explanation)) == 2


def test_reply_is_truncated_to_two_sentences(monkeypatch):
    facts = planted_ring()
    payload = build_facts_payload(facts, 93)

    async def chatty_gemini(received):
        # Four sentences, every number taken from the payload -> guardrail
        # passes, but the reply must still be cut down to two sentences.
        return (
            f"{payload['num_accounts']} accounts moved "
            f"{payload['total_amount']:,.0f}. "
            f"{payload['num_edges']} transfers happened in "
            f"{payload['time_window_seconds']} seconds. "
            f"Risk is {payload['risk_score_0_to_100']} out of "
            f"{payload['score_max']}. "
            f"Review the {payload['num_accounts']} accounts manually."
        )

    monkeypatch.setattr(config, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr("app.explanation._call_gemini", chatty_gemini)

    explanation, source = run(explain_ring(facts, 93))
    assert source == "gemini"
    assert len(sentences(explanation)) == 2


def test_clean_reply_strips_markdown_and_whitespace():
    raw = "  **Two** sentences\nhere. And a third one.  "
    assert clean_reply(raw) == "Two sentences here. And a third one."


# --- local Ollama layer ------------------------------------------------------


def test_local_model_reply_passes_guardrail_is_used(monkeypatch):
    facts = planted_ring()
    risk = 93
    payload = build_facts_payload(facts, risk)

    async def fake_ollama(received):
        assert received == payload, "local model must get the same FACTS payload"
        return (
            f"{payload['num_new_accounts']} first-time receiver accounts moved "
            f"{payload['total_amount']:,.0f} in {payload['time_window_seconds']} "
            f"seconds. A risk score of {payload['risk_score_0_to_100']} means a "
            "human analyst makes the final decision."
        )

    monkeypatch.setattr(config, "OLLAMA_ENABLED", True)
    monkeypatch.setattr("app.explanation._call_ollama", fake_ollama)

    explanation, source = run(explain_ring(facts, risk))
    assert source == "ollama"
    assert len(sentences(explanation)) == 2


def test_local_model_hallucination_falls_back_to_template(monkeypatch):
    async def fake_ollama(payload):
        return "The ring moved 999,999,999 through 44 accounts."

    monkeypatch.setattr(config, "OLLAMA_ENABLED", True)
    monkeypatch.setattr("app.explanation._call_ollama", fake_ollama)

    explanation, source = run(explain_ring(planted_ring(), 93))
    assert source == "template"
    assert "999,999,999" not in explanation


def test_gemini_failure_falls_through_to_local_model(monkeypatch):
    async def broken_gemini(payload):
        raise httpx.ConnectError("gemini is down")

    async def fake_ollama(payload):
        return (
            f"{payload['num_new_accounts']} first-time receiver accounts moved "
            f"{payload['total_amount']:,.0f} in {payload['time_window_seconds']} "
            f"seconds. A risk score of {payload['risk_score_0_to_100']} means a "
            "human analyst makes the final decision."
        )

    monkeypatch.setattr(config, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(config, "OLLAMA_ENABLED", True)
    monkeypatch.setattr("app.explanation._call_gemini", broken_gemini)
    monkeypatch.setattr("app.explanation._call_ollama", fake_ollama)

    _, source = run(explain_ring(planted_ring(), 93))
    assert source == "ollama"


def test_both_providers_failing_ends_in_template(monkeypatch):
    async def broken(payload):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(config, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(config, "OLLAMA_ENABLED", True)
    monkeypatch.setattr("app.explanation._call_gemini", broken)
    monkeypatch.setattr("app.explanation._call_ollama", broken)

    explanation, source = run(explain_ring(planted_ring(), 93))
    assert source == "template"
    assert len(sentences(explanation)) == 2


def test_health_publishes_the_local_chain(monkeypatch):
    monkeypatch.setattr(config, "OLLAMA_ENABLED", True)
    from fastapi.testclient import TestClient
    from app.main import app

    body = TestClient(app).get("/health").json()
    assert body["llm"] == "ollama"
    assert body["llm_chain"] == ["ollama", "template"]
    assert body["ollama_model"] == config.OLLAMA_MODEL
