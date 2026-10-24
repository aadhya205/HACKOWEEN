"""Built-in fake rings, used until Person 1's detection module exists.

R1 mirrors the planted ring from the plan: one source fans 6 equal-ish
amounts out to 6 throwaway mules, which merge everything into a single
sink — all inside ~2 minutes. It should score in the low 90s.

R2 is a slower, messier circular flow so the dashboard shows score range.

Person 4 can replace these entirely by writing data/fake_alerts.json
(same JSON shape as the shared alert format) — see README.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .models import Edge, RingFacts

_DEMO_START = datetime(2025, 10, 24, 9, 0, 0, tzinfo=timezone.utc)


def planted_ring() -> RingFacts:
    """Fan-out then merge, 8 accounts, 110 seconds — the demo ring."""
    source = "ACC7001"
    sink = "ACC7002"
    mules = [f"MULE{i:03d}" for i in range(1, 7)]
    edges: list[Edge] = []
    for index, mule in enumerate(mules):
        edges.append(
            Edge(
                source=source,
                target=mule,
                amount=8000.0,
                timestamp=_DEMO_START + timedelta(seconds=8 * index),
            )
        )
    for index, mule in enumerate(mules):
        edges.append(
            Edge(
                source=mule,
                target=sink,
                amount=7900.0,
                timestamp=_DEMO_START + timedelta(seconds=55 + 9 * index),
            )
        )
    return RingFacts(
        ring_id="R1",
        accounts=[source, *mules, sink],
        edges=edges,
        total_amount=48_000.0,
        time_window_seconds=110.0,
        new_accounts=7,
        pattern="fan-out then merge",
    )


def circular_ring() -> RingFacts:
    """A slower 3-account circular flow — a medium-score decoy-ish ring."""
    first, second, third = "ACC9101", "ACC9102", "ACC9103"
    return RingFacts(
        ring_id="R2",
        accounts=[first, second, third],
        edges=[
            Edge(source=first, target=second, amount=12_000.0,
                 timestamp=_DEMO_START),
            Edge(source=second, target=third, amount=11_900.0,
                 timestamp=_DEMO_START + timedelta(hours=2)),
            Edge(source=third, target=first, amount=11_800.0,
                 timestamp=_DEMO_START + timedelta(hours=5, minutes=30)),
        ],
        total_amount=35_700.0,
        time_window_seconds=19_800.0,
        new_accounts=1,
        pattern="circular flow",
    )


FAKE_RINGS: list[RingFacts] = [planted_ring(), circular_ring()]
