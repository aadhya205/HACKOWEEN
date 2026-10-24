"""Risk score: weights, breakdown math, and planted-ring vs decoy separation."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.fake_rings import circular_ring, planted_ring
from app.models import Edge, RingFacts
from app.scoring import (
    ACCOUNTS_WEIGHT,
    ACCOUNT_NEWNESS_WEIGHT,
    ANOMALY_WEIGHT,
    AMOUNT_SIMILARITY_WEIGHT,
    TIME_WINDOW_WEIGHT,
    TOTAL_AMOUNT_WEIGHT,
    resolve_window,
    score_ring,
)

BASE_WEIGHTS = [
    ACCOUNTS_WEIGHT,
    TIME_WINDOW_WEIGHT,
    AMOUNT_SIMILARITY_WEIGHT,
    TOTAL_AMOUNT_WEIGHT,
    ACCOUNT_NEWNESS_WEIGHT,
]


def test_base_weights_sum_to_100():
    assert sum(BASE_WEIGHTS) == 100.0


def test_planted_ring_scores_high_with_consistent_breakdown():
    risk, breakdown = score_ring(planted_ring())
    assert risk >= 85, f"planted demo ring should be clearly risky, got {risk}"
    # risk is the rounded integer of the summed (1-dp) contributions.
    assert abs(sum(row.contribution for row in breakdown) - risk) <= 0.6
    assert {row.feature for row in breakdown} >= {
        "Linked accounts",
        "Time window (seconds)",
        "Amount similarity",
        "Total amount moved",
        "Account newness",
    }
    for row in breakdown:
        assert 0.0 <= row.normalized <= 1.0
        assert row.contribution <= row.weight + 0.001


def test_score_is_a_weighted_sum_of_normalised_features():
    _, breakdown = score_ring(planted_ring())
    for row in breakdown:
        assert row.contribution == round(row.normalized * row.weight, 1)


def test_payroll_decoy_scores_far_below_planted_ring():
    """A legitimate payroll fan-out is not a mule ring: fewer new accounts,
    a day-long window, varied salaries."""
    start = datetime(2025, 10, 24, 9, 0, 0, tzinfo=timezone.utc)
    employees = [f"EMP{i:03d}" for i in range(1, 50)]
    decoy = RingFacts(
        ring_id="PAYROLL",
        accounts=["EMPLOYER", *employees],
        edges=[
            Edge(
                source="EMPLOYER",
                target=employee,
                amount=1000.0 + 37.0 * index,
                timestamp=start + timedelta(minutes=3 * index),
            )
            for index, employee in enumerate(employees)
        ],
        time_window_seconds=86_400.0,
        new_accounts=2,
        pattern="salary run",
    )
    decoy_risk, _ = score_ring(decoy)
    planted_risk, _ = score_ring(planted_ring())
    assert decoy_risk <= 60
    assert planted_risk - decoy_risk >= 25


def test_anomaly_score_is_blended_and_weights_still_sum_to_100():
    ring = planted_ring()
    ring.anomaly_score = 0.9
    risk, breakdown = score_ring(ring)
    assert sum(row.weight for row in breakdown) == 100.0
    anomaly_row = next(
        row for row in breakdown if row.feature.startswith("Anomaly")
    )
    assert anomaly_row.weight == ANOMALY_WEIGHT
    assert anomaly_row.contribution == round(0.9 * ANOMALY_WEIGHT, 1)
    assert 0 <= risk <= 100
    # With a high anomaly score the ring should not score lower than without.
    base_risk, _ = score_ring(planted_ring())
    assert risk >= base_risk - 5


def test_window_derived_from_edge_timestamps_when_not_stated():
    start = datetime(2025, 10, 24, 9, 0, 0, tzinfo=timezone.utc)
    ring = RingFacts(
        ring_id="DERIVED",
        accounts=["A", "B"],
        edges=[
            Edge(source="A", target="B", amount=10.0, timestamp=start),
            Edge(source="B", target="A", amount=10.0,
                 timestamp=start + timedelta(seconds=42)),
        ],
    )
    window, note = resolve_window(ring)
    assert window == 42.0
    assert note == "derived from edge timestamps"


def test_missing_window_is_assumed_and_noted():
    ring = RingFacts(ring_id="NOTIME", accounts=["A"], edges=[])
    window, note = resolve_window(ring)
    assert window == 180.0
    assert "assumed" in note


def test_single_edge_and_empty_rings_do_not_crash():
    single = RingFacts(
        ring_id="SOLO",
        accounts=["A", "B"],
        edges=[Edge(source="A", target="B", amount=100.0)],
        total_amount=None,
    )
    risk, breakdown = score_ring(single)
    assert 0 <= risk <= 100
    similarity_row = next(r for r in breakdown if r.feature == "Amount similarity")
    assert "not measurable" in (similarity_row.note or "")

    empty = RingFacts(ring_id="EMPTY", accounts=[], edges=[])
    risk, _ = score_ring(empty)
    assert 0 <= risk <= 100


def test_total_falls_back_to_summing_edges():
    ring = circular_ring()
    ring.total_amount = None
    risk, breakdown = score_ring(ring)
    total_row = next(r for r in breakdown if r.feature == "Total amount moved")
    assert total_row.raw == 35_700.0
    assert 0 <= risk <= 100
