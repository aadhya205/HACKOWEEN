"""Expected-loss decision layer: probability in, recommended action out.

A calibration curve gives P(fraud). An analyst still needs to know *what to
do*, and "what to do" is an economic question: missing fraud, freezing a
legitimate account, and spending analyst time all cost something. This
module prices the three actions with a documented matrix and picks the
cheapest one.

Losses are unitless and normalised to one unit of exposure, so the model
does not depend on the currency or the size of the ring:

    action      loss if fraud    loss if legitimate
    freeze      0.10 (late)      0.60 (blocked customer, complaints)
    escalate    0.50 (delay)     0.05 (analyst review)
    watch       1.00 (all lost)  0.00

Those five numbers are the whole policy. They are constants, they are
published at GET /policy, and changing any of them changes
POLICY_VERSION, which is stamped on every alert and included in the cache
key - so a score can always be traced back to the matrix that produced it.
"""

from __future__ import annotations

import hashlib
import json
from typing import Literal

Action = Literal["freeze", "escalate", "watch"]

# Loss given the ring is fraudulent, and given it is legitimate.
COST_MATRIX: dict[str, dict[str, float]] = {
    "freeze": {"fraud": 0.10, "legit": 0.60},
    "escalate": {"fraud": 0.50, "legit": 0.05},
    "watch": {"fraud": 1.00, "legit": 0.00},
}

# Tie-break order: the least intrusive action wins a tie.
ACTION_ORDER: tuple[Action, ...] = ("watch", "escalate", "freeze")

_MATERIAL = json.dumps(COST_MATRIX, sort_keys=True)
POLICY_VERSION = "policy-" + hashlib.sha256(_MATERIAL.encode()).hexdigest()[:8]

RATIONALES = {
    "freeze": "freezing now",
    "escalate": "sending it to an analyst",
    "watch": "monitoring it",
}

ACTION_LABELS = {
    "freeze": "freezing",
    "escalate": "escalating",
    "watch": "watching",
}


def expected_losses(probability: float) -> dict[str, float]:
    """Expected loss of each action at this P(fraud), in exposure units."""
    p = min(max(float(probability), 0.0), 1.0)
    return {
        action: round(p * costs["fraud"] + (1 - p) * costs["legit"], 4)
        for action, costs in COST_MATRIX.items()
    }


def decide(probability: float) -> tuple[Action, dict[str, float], str]:
    """Return (action, losses, one-line rationale)."""
    losses = expected_losses(probability)
    action = min(ACTION_ORDER, key=lambda name: (losses[name], ACTION_ORDER.index(name)))
    alternatives = sorted(
        (losses[name], f"{ACTION_LABELS[name]} {losses[name]:.2f}")
        for name in ACTION_ORDER
        if name != action
    )
    p = min(max(probability, 0.0), 1.0)
    rationale = (
        f"At P(fraud)={p:.2f}, {RATIONALES[action]} costs {losses[action]:.2f} "
        f"in expected loss - less than {alternatives[0][1]} or {alternatives[1][1]}."
    )
    return action, losses, rationale


def _break_even(first: str, second: str) -> float | None:
    """P(fraud) where two actions cost the same: p*F + (1-p)*L."""
    f1, l1 = COST_MATRIX[first]["fraud"], COST_MATRIX[first]["legit"]
    f2, l2 = COST_MATRIX[second]["fraud"], COST_MATRIX[second]["legit"]
    denominator = (f1 - l1) - (f2 - l2)
    if abs(denominator) < 1e-9:
        return None
    value = (l2 - l1) / denominator
    if not -0.5 <= value <= 1.5:
        return None
    return round(min(max(value, 0.0), 1.0), 4)


def thresholds() -> dict[str, float]:
    """Where each action becomes cheaper than the one below it."""
    watch_escalate = _break_even("watch", "escalate")
    escalate_freeze = _break_even("escalate", "freeze")
    result: dict[str, float] = {}
    if watch_escalate is not None:
        result["watch_to_escalate"] = watch_escalate
    if escalate_freeze is not None:
        result["escalate_to_freeze"] = escalate_freeze
    return result


def policy_summary() -> dict:
    """Everything GET /policy publishes - no hidden numbers."""
    return {
        "policy_version": POLICY_VERSION,
        "actions": list(ACTION_ORDER),
        "cost_matrix": COST_MATRIX,
        "implied_thresholds": thresholds(),
        "note": (
            "Losses are normalised to one unit of exposure. Freezing is priced "
            "as cheap late action but expensive when wrong; escalation buys "
            "certainty for an analyst's time. Thresholds fall out of the matrix "
            "instead of being hard-coded."
        ),
    }
