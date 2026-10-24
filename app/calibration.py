"""Turn the 0-100 risk score into a calibrated P(fraud).

A raw weighted score is a *ranking* signal. "93" tells an analyst very
little on its own; "P(fraud) = 0.86" tells them what to do and lets a cost
model price the action. The mapping is monotonic - a higher score never
means a lower probability - and is fitted with Platt scaling (logistic
regression on the single score feature) over `app.labelled`.

Why logistic rather than isotonic: the labelled set overlaps by design
(gig payroll scores like a mule ring), so isotonic would fit a step function
with 0s in the gap and hand out fake certainty. Platt smoothing keeps the
probabilities graded where the evidence is genuinely ambiguous.

Honest scope: the curve is fitted on synthetic labelled data committed in
this repo. A bank would refit it on confirmed cases; `data/calibration.json`
can override the fitted curve without touching code.
"""

from __future__ import annotations

import hashlib
import json
import logging
from functools import lru_cache
from pathlib import Path

import math

from .labelled import labelled_scores
from .scoring import score_ring

log = logging.getLogger("calibration")

# Used when nothing can be fitted (kept deliberately conservative).
FALLBACK_POINTS: list[tuple[float, float]] = [
    (0.0, 0.01), (40.0, 0.05), (55.0, 0.15), (68.0, 0.35),
    (78.0, 0.6), (88.0, 0.85), (100.0, 0.97),
]


class Calibration:
    """A monotonic piecewise-linear map from score to probability."""

    def __init__(
        self,
        points: list[tuple[float, float]],
        *,
        method: str,
        samples: int,
    ) -> None:
        self.points = sorted((float(x), float(y)) for x, y in points)
        self.method = method
        self.samples = samples
        material = json.dumps([[round(x, 2), round(y, 4)] for x, y in self.points])
        self.version = "cal-" + hashlib.sha256(material.encode()).hexdigest()[:8]

    def apply(self, score: float) -> float:
        """Interpolate the curve; flat outside the fitted range."""
        points = self.points
        if not points:
            return 0.0
        if score <= points[0][0]:
            return _clamp(points[0][1])
        if score >= points[-1][0]:
            return _clamp(points[-1][1])
        for (left_x, left_y), (right_x, right_y) in zip(points, points[1:]):
            if left_x <= score <= right_x:
                if right_x == left_x:
                    return _clamp(right_y)
                ratio = (score - left_x) / (right_x - left_x)
                return _clamp(left_y + ratio * (right_y - left_y))
        return _clamp(points[-1][1])

    def summary(self) -> dict:
        return {
            "method": self.method,
            "samples": self.samples,
            "version": self.version,
            "curve": [[round(x, 1), round(y, 4)] for x, y in self.points],
        }


def _clamp(value: float) -> float:
    return min(max(float(value), 0.0), 1.0)


def _sigmoid(z: float) -> float:
    """Numerically safe logistic: never overflows, never returns 0 or 1."""
    z = max(min(z, 60.0), -60.0)
    return 1.0 / (1.0 + math.exp(-z))


def _platt(samples: list[tuple[float, int]]) -> tuple[float, float]:
    """Fit p = sigmoid(a * score/100 + b) by gradient descent.

    Platt's smoothed targets avoid the infinite weights a perfectly
    separable dataset would otherwise produce, and a light L2 term keeps
    the fit stable on 20-ish examples. Expect a > 0: a higher score must
    never mean a lower probability.
    """
    ordered = [(float(score) / 100.0, int(label)) for score, label in samples]
    positives = sum(label for _, label in ordered)
    negatives = len(ordered) - positives
    target_pos = (positives + 1) / (positives + 2)
    target_neg = 1 / (negatives + 2)
    targets = [target_pos if label else target_neg for _, label in ordered]

    a, b = -1.0, 0.0
    rate, l2 = 0.6, 1e-3
    for _ in range(4000):
        grad_a = grad_b = 0.0
        for (score_norm, _), target in zip(ordered, targets):
            error = _sigmoid(a * score_norm + b) - target
            grad_a += error * score_norm
            grad_b += error
        grad_a = grad_a / len(ordered) + l2 * a
        grad_b = grad_b / len(ordered) + l2 * b
        a -= rate * grad_a
        b -= rate * grad_b
    return a, b


def fit(samples: list[tuple[float, int]], *, method: str = "Platt scaling (logistic)") -> Calibration:
    """Fit the curve, then sample it every 5 points for interpolation."""
    if not samples:
        return Calibration(FALLBACK_POINTS, method="fallback curve", samples=0)

    a, b = _platt(samples)
    points = [(score, _sigmoid(a * score / 100.0 + b)) for score in range(0, 101, 5)]
    return Calibration(points, method=method, samples=len(samples))


def _from_file(path: Path) -> Calibration | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        points = [(float(x), float(y)) for x, y in payload["points"]]
        return Calibration(
            points,
            method=str(payload.get("method", "committed curve")),
            samples=int(payload.get("samples", 0)),
        )
    except Exception:
        log.exception("could not read %s; falling back to the fitted curve", path)
        return None


@lru_cache(maxsize=1)
def load() -> Calibration:
    """Committed curve if present, else fit on the labelled dataset."""
    from . import config as settings  # late import keeps tests patchable

    committed = _from_file(Path(settings.CALIBRATION_PATH))
    if committed is not None:
        return committed
    try:
        return fit(labelled_scores(score_ring))
    except Exception:
        log.exception("calibration fit failed; using the fallback curve")
        return Calibration(FALLBACK_POINTS, method="fallback curve", samples=0)


def probability(score: float) -> float:
    return load().apply(score)
