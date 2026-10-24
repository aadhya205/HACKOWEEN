"""Transparent weighted risk score — the "why 94" explainability story.

A ring's score out of 100 is a plain weighted sum of five normalised
features (weights agreed in the team plan, section 1B):

    number of accounts in the ring .......... 25
    time window (shorter is worse) .......... 25
    amount similarity (split chunks) ........ 20
    total amount (exposure) ................. 15
    account newness (throwaway receivers) ... 15

If Person 1 supplies an Isolation Forest anomaly score it takes 10 points
and the other five weights scale down to 90, so the breakdown always sums
to exactly 100.

Normalisation thresholds are the constants below — tune them here and
nowhere else, and they are easy to explain to a judge.
"""

from __future__ import annotations

import statistics

from .models import RingFacts, ScoreFeature

# --- weights (points out of 100) ------------------------------------
ACCOUNTS_WEIGHT = 25.0
TIME_WINDOW_WEIGHT = 25.0
AMOUNT_SIMILARITY_WEIGHT = 20.0
TOTAL_AMOUNT_WEIGHT = 15.0
ACCOUNT_NEWNESS_WEIGHT = 15.0
ANOMALY_WEIGHT = 10.0  # only when Person 1 supplies anomaly_score

# --- normalisation thresholds ---------------------------------------
FULL_ACCOUNTS = 6.0  # 6+ linked accounts -> full marks
FULL_WINDOW_SECONDS = 600.0  # a 10-minute-old ring scores 0 on time
FULL_TOTAL_AMOUNT = 50_000.0  # >= 50k moved -> full exposure marks
DEFAULT_WINDOW_SECONDS = 180.0  # assumed when the ring carries no timing
UNKNOWN_NEWNESS = 0.5  # assumed when account-age data is missing


def resolve_total(facts: RingFacts) -> float:
    """Stated total, or the sum of the edges when detection omits it."""
    if facts.total_amount is not None:
        return float(facts.total_amount)
    return float(sum(edge.amount for edge in facts.edges))


def resolve_window(facts: RingFacts) -> tuple[float, str | None]:
    """Seconds the ring was active, plus a note when it had to be guessed."""
    if facts.time_window_seconds is not None:
        return max(0.0, float(facts.time_window_seconds)), None
    stamps = [edge.timestamp for edge in facts.edges if edge.timestamp is not None]
    if len(stamps) >= 2:
        span = (max(stamps) - min(stamps)).total_seconds()
        return max(0.0, span), "derived from edge timestamps"
    return DEFAULT_WINDOW_SECONDS, "assumed 180s, ring has no timing data"


def resolve_newness(facts: RingFacts) -> tuple[float, str | None]:
    """Fraction of ring accounts that are first-time receivers (0-1)."""
    count = len(facts.accounts)
    if count == 0:
        return 0.0, "ring has no accounts"
    if facts.new_accounts is None:
        return UNKNOWN_NEWNESS, "assumed 0.5, no account-age data"
    return min(max(facts.new_accounts, 0) / count, 1.0), None


def amount_similarity(facts: RingFacts) -> tuple[float, str | None]:
    """1 - coefficient of variation of edge amounts (1 = equal splits)."""
    amounts = [float(edge.amount) for edge in facts.edges]
    if len(amounts) < 2:
        return 0.0, "single transfer, similarity not measurable"
    mean = statistics.fmean(amounts)
    if mean == 0:
        return 0.0, "zero-value transfers"
    variation = statistics.pstdev(amounts) / mean
    return min(max(1.0 - variation, 0.0), 1.0), None


def score_ring(facts: RingFacts) -> tuple[int, list[ScoreFeature]]:
    """Return (risk out of 100, per-feature breakdown).

    Each breakdown row shows the raw value, how it normalised to 0-1, the
    weight available and the points actually earned — that row set *is*
    the pitch's explainability claim.
    """
    # When the anomaly feature is present, base weights shrink to 90
    # total so the breakdown still sums to exactly 100.
    scale = (100.0 - ANOMALY_WEIGHT) / 100.0 if facts.anomaly_score is not None else 1.0
    rows: list[ScoreFeature] = []

    def add(feature: str, raw, normalized: float, weight: float, note=None) -> None:
        normalized = min(max(normalized, 0.0), 1.0)
        rows.append(
            ScoreFeature(
                feature=feature,
                raw=raw,
                normalized=round(normalized, 3),
                weight=round(weight, 1),
                contribution=round(normalized * weight, 1),
                note=note,
            )
        )

    # 1. More mules means a more organised ring.
    num_accounts = len(facts.accounts)
    add(
        "Linked accounts",
        num_accounts,
        num_accounts / FULL_ACCOUNTS,
        ACCOUNTS_WEIGHT * scale,
    )

    # 2. Money moved in minutes is suspicious; a 10-minute-old ring is cold.
    window, window_note = resolve_window(facts)
    add(
        "Time window (seconds)",
        round(window, 1),
        1.0 - min(window, FULL_WINDOW_SECONDS) / FULL_WINDOW_SECONDS,
        TIME_WINDOW_WEIGHT * scale,
        window_note,
    )

    # 3. Splitting into near-equal chunks is the classic mule pattern.
    similarity, similarity_note = amount_similarity(facts)
    add(
        "Amount similarity",
        round(similarity, 3),
        similarity,
        AMOUNT_SIMILARITY_WEIGHT * scale,
        similarity_note,
    )

    # 4. Higher total means higher exposure.
    total = resolve_total(facts)
    add(
        "Total amount moved",
        round(total, 2),
        total / FULL_TOTAL_AMOUNT,
        TOTAL_AMOUNT_WEIGHT * scale,
    )

    # 5. Throwaway first-time receivers.
    newness, newness_note = resolve_newness(facts)
    add(
        "Account newness",
        round(newness, 3),
        newness,
        ACCOUNT_NEWNESS_WEIGHT * scale,
        newness_note,
    )

    # 6. Optional: Person 1's Isolation Forest score, as one more feature.
    if facts.anomaly_score is not None:
        add(
            "Anomaly score (Isolation Forest)",
            round(facts.anomaly_score, 3),
            float(facts.anomaly_score),
            ANOMALY_WEIGHT,
        )

    risk = int(round(sum(row.contribution for row in rows)))
    return min(max(risk, 0), 100), rows
