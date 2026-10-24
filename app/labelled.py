"""A small labelled dataset used to calibrate the risk score.

The score out of 100 is a ranking signal, not a probability: 93 does not
mean "93% fraud". This module builds a *labelled* set - planted rings
(positive) and realistic legitimate patterns (negative) - so
``app.calibration`` can learn the mapping score -> P(fraud).

It is synthetic on purpose and says so: the curve is only as honest as
this data, and a real deployment would refit it on the bank's own
confirmed cases. Everything is deterministic (fixed seed, fixed start
time) so the committed calibration curve is reproducible.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from .models import Edge, RingFacts

_START = datetime(2025, 3, 1, 9, 0, 0, tzinfo=timezone.utc)


def _edge(source: str, target: str, amount: float, seconds: float) -> Edge:
    return Edge(
        source=source,
        target=target,
        amount=round(amount, 2),
        timestamp=_START + timedelta(seconds=seconds),
    )


def _ring(
    ring_id: str,
    accounts: list[str],
    edges: list[Edge],
    new_accounts: int,
    pattern: str,
) -> RingFacts:
    return RingFacts(
        ring_id=ring_id,
        accounts=accounts,
        edges=edges,
        new_accounts=new_accounts,
        pattern=pattern,
    )


# --- positives: actual laundering shapes ------------------------------------


def _fan_out(mules: int, window: float, jitter: float, new: int | None) -> RingFacts:
    """One source -> N mules -> one sink, all inside `window` seconds."""
    rng = random.Random(7 * mules + int(window))
    accounts = ["ACC1000", *[f"MULE{m:03d}" for m in range(1, mules + 1)], "ACC2000"]
    edges: list[Edge] = []
    per_leg = 90_000 / (2 * mules)
    for index in range(mules):
        amount = per_leg * (1 + rng.uniform(-jitter, jitter))
        edges.append(_edge("ACC1000", f"MULE{index + 1:03d}", amount,
                           window * 0.45 * index / max(mules - 1, 1)))
    for index in range(mules):
        amount = per_leg * (1 + rng.uniform(-jitter, jitter)) * 0.98
        edges.append(_edge(f"MULE{index + 1:03d}", "ACC2000", amount,
                           window * 0.55 + window * 0.45 * index / max(mules - 1, 1)))
    return _ring(
        f"FAN{mules}_{int(window)}",
        accounts,
        edges,
        new if new is not None else mules,
        "fan-out then merge",
    )


def _cycle(accounts: int, window: float) -> RingFacts:
    """A -> B -> C -> A: money comes back to where it started."""
    rng = random.Random(accounts * 31 + int(window))
    ids = [f"CY{accounts}{index}" for index in range(accounts)]
    edges = [
        _edge(ids[index], ids[(index + 1) % accounts],
              40_000 * (1 + rng.uniform(-0.04, 0.04)),
              window * index / accounts)
        for index in range(accounts)
    ]
    return _ring(f"CYC{accounts}_{int(window)}", ids, edges, accounts,
                 "circular flow")


def _gather_scatter() -> RingFacts:
    """Three collectors feed one account, which fans straight back out."""
    edges = [
        _edge("IN1", "MID", 15_000, 0),
        _edge("IN2", "MID", 15_200, 12),
        _edge("IN3", "MID", 14_900, 25),
        _edge("MID", "OUT1", 14_800, 60),
        _edge("MID", "OUT2", 15_100, 72),
        _edge("MID", "OUT3", 15_050, 88),
    ]
    return _ring("GATHER1", ["IN1", "IN2", "IN3", "MID", "OUT1", "OUT2", "OUT3"],
                 edges, 6, "gather then scatter")


def laundering_examples() -> list[RingFacts]:
    return [
        _fan_out(6, 110, 0.01, 7),
        _fan_out(8, 95, 0.02, 8),
        _fan_out(5, 180, 0.05, 4),
        _fan_out(4, 300, 0.08, 3),
        _fan_out(3, 420, 0.12, 2),
        _fan_out(7, 240, 0.03, 6),
        _cycle(3, 2_400),
        _cycle(3, 9_000),
        _cycle(4, 1_800),
        _gather_scatter(),
        # A real but careless ring: slow, small, noisy amounts. It scores far
        # below the polished ones - that overlap is what makes calibration honest.
        _fan_out(3, 720, 0.15, 2),
    ]


# --- negatives: legitimate patterns that look ring-ish ----------------------


def _payroll(employees: int, spread_seconds: float) -> RingFacts:
    """One company account paying monthly salaries: fan-out, equal amounts."""
    rng = random.Random(employees)
    accounts = ["EMPLOYER", *[f"EMP{i:03d}" for i in range(1, employees + 1)]]
    edges = [
        _edge("EMPLOYER", f"EMP{i:03d}",
              45_000 * (1 + rng.uniform(-0.05, 0.05)),
              spread_seconds * i / employees)
        for i in range(1, employees + 1)
    ]
    return _ring(f"PAYROLL{employees}", accounts, edges, 0, "payroll batch")


def _merchant(settlements: int) -> RingFacts:
    """Many customers paying one merchant over a month, wildly varied sizes."""
    rng = random.Random(settlements * 3)
    accounts = [f"CUST{i:03d}" for i in range(1, settlements + 1)] + ["MERCHANT"]
    edges = [
        _edge(f"CUST{i:03d}", "MERCHANT", rng.uniform(120, 9_500),
              86_400 * i / settlements)
        for i in range(1, settlements + 1)
    ]
    return _ring(f"MERCHANT{settlements}", accounts, edges, 0,
                 "merchant settlements")


def _rent_split() -> RingFacts:
    """Four flatmates paying rent to one landlord every month."""
    edges = []
    for month in range(6):
        for index, flatmate in enumerate(("FLAT1", "FLAT2", "FLAT3", "FLAT4")):
            edges.append(_edge(flatmate, "LANDLORD", 12_000,
                               30 * 86_400 * month + 60 * index))
    return _ring("RENT", ["FLAT1", "FLAT2", "FLAT3", "FLAT4", "LANDLORD"],
                 edges, 0, "rent collection")


def _loan_disbursement() -> RingFacts:
    """A lender paying out 40 new borrowers over two days - looks like a ring."""
    rng = random.Random(11)
    accounts = ["LENDER", *[f"BORROW{i:03d}" for i in range(1, 41)]]
    edges = [
        _edge("LENDER", f"BORROW{i:03d}",
              rng.choice([25_000, 40_000, 60_000, 120_000, 200_000]),
              172_800 * i / 40)
        for i in range(1, 41)
    ]
    return _ring("LOANS", accounts, edges, 40, "loan disbursement")


def _refunds() -> RingFacts:
    """A merchant refunding 30 customers after a batch of cancelled orders."""
    rng = random.Random(23)
    accounts = ["SHOP", *[f"BUYER{i:03d}" for i in range(1, 31)]]
    edges = [
        _edge("SHOP", f"BUYER{i:03d}", rng.uniform(500, 8_000), 3_600 * i / 30)
        for i in range(1, 31)
    ]
    return _ring("REFUNDS", accounts, edges, 0, "refund batch")


def _savings_round_trip() -> RingFacts:
    """Money parked in a second account and returned months later."""
    return _ring(
        "SAVINGS",
        ["SAV1", "SAV2"],
        [
            _edge("SAV1", "SAV2", 80_000, 0),
            _edge("SAV2", "SAV1", 80_500, 90 * 86_400),
        ],
        0,
        "savings transfer",
    )


def _gig_payroll() -> RingFacts:
    """A platform paying 40 gig workers in one batch: legitimate, but it
    genuinely looks like a fan-out ring - the overlap calibration needs."""
    rng = random.Random(59)
    accounts = ["GIGPLATFORM", *[f"GIG{i:03d}" for i in range(1, 41)]]
    edges = [
        _edge("GIGPLATFORM", f"GIG{i:03d}",
              18_000 * (1 + rng.uniform(-0.12, 0.12)), 1_200 * i / 40)
        for i in range(1, 41)
    ]
    return _ring("GIGPAY", accounts, edges, 0, "gig payroll batch")


def _payouts() -> RingFacts:
    """A platform paying 25 creators monthly, roughly similar amounts."""
    rng = random.Random(41)
    accounts = ["PLATFORM", *[f"CREATOR{i:03d}" for i in range(1, 26)]]
    edges = [
        _edge("PLATFORM", f"CREATOR{i:03d}",
              9_000 * (1 + rng.uniform(-0.25, 0.25)), 2_400 * i / 25)
        for i in range(1, 26)
    ]
    return _ring("PAYOUTS", accounts, edges, 0, "creator payouts")


def legitimate_examples() -> list[RingFacts]:
    return [
        _payroll(50, 3_600),
        _payroll(18, 900),
        _merchant(40),
        _merchant(12),
        _rent_split(),
        _loan_disbursement(),
        _refunds(),
        _savings_round_trip(),
        _payouts(),
        _gig_payroll(),
    ]


def labelled_facts() -> list[tuple[RingFacts, int]]:
    """(ring, label) where 1 = confirmed laundering, 0 = legitimate."""
    positives = [(ring, 1) for ring in laundering_examples()]
    negatives = [(ring, 0) for ring in legitimate_examples()]
    return positives + negatives


def labelled_scores(score_ring) -> list[tuple[float, int]]:
    """Score every labelled ring; `score_ring` is app.scoring.score_ring."""
    return [(float(score_ring(ring)[0]), label) for ring, label in labelled_facts()]
