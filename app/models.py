"""The shared alert contract (team plan, section 5).

Person 3 builds against these exact field names:

    ring_id, accounts, edges[from, to, amount], total_amount, risk, explanation

Everything else here (score_breakdown, explanation_source, ...) is additive
and safe to ignore in the frontend. Please don't remove or rename the six
above without telling the group.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class Edge(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    # "from" is a Python keyword, so the Python name is `source`.
    # Accepts {"from": ...}, {"source": ...} or {"sender": ...} on input;
    # always serialises back as "from"/"to" for the frontend.
    source: str = Field(
        validation_alias=AliasChoices("from", "source", "sender"),
        serialization_alias="from",
    )
    target: str = Field(
        validation_alias=AliasChoices("to", "target", "receiver"),
        serialization_alias="to",
    )
    amount: float
    timestamp: datetime | None = None


class ScoreFeature(BaseModel):
    """One row of the "why 94" breakdown panel."""

    feature: str
    raw: str | float | int
    normalized: float = Field(ge=0.0, le=1.0)
    weight: float
    contribution: float
    note: str | None = None


class ExpectedLoss(BaseModel):
    """Expected cost of each action, in units of exposure (0 = free)."""

    freeze: float
    escalate: float
    watch: float


class Decision(BaseModel):
    """What to do about an alert, and what it would cost.

    The action is chosen by minimising expected loss, not by a threshold
    buried in code - see app/policy.py for the published matrix.
    """

    recommended_action: Literal["freeze", "escalate", "watch"]
    expected_loss: ExpectedLoss
    policy_version: str
    rationale: str


class Alert(BaseModel):
    """One alert in the shared format, plus the additive extras."""

    ring_id: str
    accounts: list[str]
    edges: list[Edge]
    total_amount: float
    risk: int = Field(ge=0, le=100)
    explanation: str
    # --- additive fields (safe for Person 3 to ignore) ---
    score_breakdown: list[ScoreFeature] = Field(default_factory=list)
    explanation_source: Literal["gemini", "ollama", "template"] = "template"
    # Calibrated probability that the ring is real, and the priced action.
    probability: float = Field(default=0.0, ge=0.0, le=1.0)
    decision: Decision | None = None
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RingFacts(BaseModel):
    """What detection hands the backend. Missing fields degrade gracefully.

    The first six fields are the useful minimum; the rest improve the score
    or the explanation when Person 1 can provide them.
    """

    model_config = ConfigDict(extra="ignore")

    ring_id: str
    accounts: list[str]
    edges: list[Edge] = Field(default_factory=list)
    total_amount: float | None = None
    time_window_seconds: float | None = None
    new_accounts: int | None = None
    anomaly_score: float | None = Field(default=None, ge=0.0, le=1.0)
    pattern: str | None = None


class AlertsResponse(BaseModel):
    """Envelope returned by GET /alerts (each item is the shared format)."""

    alerts: list[Alert]
    count: int
    source: Literal["detection", "fake"]
    cached: bool
    generated_at: datetime
    detection_error: str | None = None
