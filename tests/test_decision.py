"""Calibration curve and expected-loss policy: the decision layer's maths.

These tests pin the properties a bank would ask about: the probability is
monotone in the score, the chosen action is the cheapest one, and every
number used to make the call is published at /policy.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app import calibration, policy
from app.fake_rings import FAKE_RINGS
from app.main import _cache_key, app

client = TestClient(app)


# --- calibration -----------------------------------------------------------


def test_curve_is_monotone_and_bounded() -> None:
    curve = calibration.load()
    probabilities = [curve.apply(score) for score in range(0, 101)]
    assert all(0.0 <= p <= 1.0 for p in probabilities)
    assert probabilities == sorted(probabilities), "a higher score must never mean lower risk"
    assert probabilities[-1] > probabilities[0]


def test_planted_ring_is_more_likely_than_the_slow_ring() -> None:
    curve = calibration.load()
    assert curve.apply(93) > curve.apply(48) > curve.apply(20)


def test_fit_reports_its_basis() -> None:
    curve = calibration.load()
    assert "logistic" in curve.method.lower()
    assert curve.samples >= 20, "the curve should be fitted, not hand-waved"
    assert curve.version.startswith("cal-")
    assert len(curve.points) > 10


# --- policy ----------------------------------------------------------------


def test_expected_loss_is_the_documented_formula() -> None:
    losses = policy.expected_losses(0.3)
    assert losses["watch"] == 0.3
    assert abs(losses["freeze"] - (0.3 * 0.10 + 0.7 * 0.60)) < 1e-6
    assert abs(losses["escalate"] - (0.3 * 0.50 + 0.7 * 0.05)) < 1e-6


def test_actions_follow_risk() -> None:
    assert policy.decide(0.95)[0] == "freeze"
    assert policy.decide(0.40)[0] == "escalate"
    assert policy.decide(0.02)[0] == "watch"


def test_chosen_action_is_the_cheapest() -> None:
    for probability in (0.005, 0.08, 0.2, 0.45, 0.59, 0.75, 0.99):
        action, losses, rationale = policy.decide(probability)
        assert losses[action] == min(losses.values())
        assert "P(fraud)" in rationale


def test_thresholds_are_ordered_and_inside_the_unit_interval() -> None:
    thresholds = policy.thresholds()
    assert 0 < thresholds["watch_to_escalate"] < thresholds["escalate_to_freeze"] < 1


# --- API surface -----------------------------------------------------------


def test_alerts_carry_probability_and_decision() -> None:
    alert = client.get("/alerts").json()["alerts"][0]
    assert 0.0 <= alert["probability"] <= 1.0

    decision = alert["decision"]
    assert decision["recommended_action"] in {"freeze", "escalate", "watch"}
    assert set(decision["expected_loss"]) == {"freeze", "escalate", "watch"}
    assert decision["policy_version"] == policy.POLICY_VERSION
    assert "P(fraud)" in decision["rationale"]


def test_high_risk_ring_recommends_freezing() -> None:
    alerts = {a["ring_id"]: a for a in client.get("/alerts").json()["alerts"]}
    assert alerts["R1"]["decision"]["recommended_action"] == "freeze"
    assert alerts["R2"]["decision"]["recommended_action"] != "freeze"


def test_policy_endpoint_publishes_every_number() -> None:
    body = client.get("/policy").json()
    assert body["cost_matrix"]["freeze"]["fraud"] == 0.10
    assert body["policy_version"] == policy.POLICY_VERSION
    assert body["calibration"]["version"] == calibration.load().version
    assert len(body["calibration"]["curve"]) > 10
    assert "watch_to_escalate" in body["implied_thresholds"]


def test_health_names_policy_and_calibration() -> None:
    body = client.get("/health").json()
    assert body["policy"] == policy.POLICY_VERSION
    assert body["calibration"].startswith("cal-")


def test_cache_key_tracks_the_policy(monkeypatch) -> None:
    facts = FAKE_RINGS[0]
    before = _cache_key(facts)
    monkeypatch.setattr(policy, "POLICY_VERSION", "policy-changed")
    assert _cache_key(facts) != before, "old alerts must not survive a policy change"
