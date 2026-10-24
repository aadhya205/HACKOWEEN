"""FastAPI app — /alerts is the endpoint Person 3's dashboard talks to.

Flow per request: detection (cached) -> risk score + breakdown -> LLM
explanation (cached per ring, template fallback) -> shared alert format.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import calibration, config, policy
from .cache import TTLCache
from .explanation import explain_ring
from .models import Alert, AlertsResponse, Decision, ExpectedLoss, RingFacts
from .ring_source import get_rings
from .scoring import resolve_total, score_ring

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("api")

app = FastAPI(
    title="Ledger of the Undead — Fraud Ring API",
    description=(
        "Spots fraud rings in a network of transactions and explains every "
        "alert in plain English. GET /alerts returns the shared alert format; "
        "each alert carries a risk score, a per-feature score_breakdown and "
        "an explanation from Gemini, then a local Ollama model, then the "
        "built-in template — whichever layer is reachable."
    ),
    version="1.0.0",
)

# Person 3's React dev server runs on another origin — allow it by default.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

alert_cache = TTLCache(config.CACHE_TTL_SECONDS)


def _detector_summary() -> dict | None:
    """Compact provenance + metrics for the currently served detection model."""
    path = Path(config.DETECTOR_METRICS_PATH)
    if not path.exists():
        return None
    try:
        metrics = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        log.warning("could not read detector metrics at %s", path)
        return None
    test = metrics.get("test") or {}
    at_threshold = (test.get("at_thresholds") or [{}])[0]
    return {
        "model": "HistGradientBoostingClassifier",
        "rows_scanned": (metrics.get("dataset") or {}).get("rows_scanned"),
        "frauds": (metrics.get("dataset") or {}).get("frauds"),
        "pr_auc": test.get("pr_auc"),
        "roc_auc": test.get("roc_auc"),
        "precision": at_threshold.get("precision"),
        "recall": at_threshold.get("recall"),
        "threshold": metrics.get("ring_threshold"),
        "generated_at": metrics.get("generated_at"),
        "metrics_path": str(path),
    }


def _cache_key(facts: RingFacts) -> str:
    """Facts plus the policy/calibration versions: new maths must not be
    served from an alert scored under the old maths."""
    material = (
        facts.model_dump_json()
        + policy.POLICY_VERSION
        + calibration.load().version
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


async def build_alert(facts: RingFacts) -> tuple[Alert, bool]:
    """Score + explain one ring. Returns (alert, was_cached)."""
    key = _cache_key(facts)
    cached_alert = alert_cache.get(key)
    if cached_alert is not None:
        return cached_alert, True

    risk, breakdown = score_ring(facts)
    probability = calibration.load().apply(risk)
    action, losses, rationale = policy.decide(probability)
    explanation, source = await explain_ring(facts, risk)
    alert = Alert(
        ring_id=facts.ring_id,
        accounts=facts.accounts,
        edges=facts.edges,
        total_amount=resolve_total(facts),
        risk=risk,
        explanation=explanation,
        score_breakdown=breakdown,
        explanation_source=source,
        probability=round(probability, 4),
        decision=Decision(
            recommended_action=action,
            expected_loss=ExpectedLoss(**losses),
            policy_version=policy.POLICY_VERSION,
            rationale=rationale,
        ),
    )
    alert_cache.set(key, alert)
    return alert, False


@app.get("/health", tags=["meta"])
def health() -> dict:
    """Liveness + which explanation layers are configured.

    "llm" is the layer tried first; every layer in "llm_chain" is attempted
    before the template. A configured Ollama does not have to be running — a
    dead local server is caught by the timeout and falls through.
    """
    chain = config.llm_chain()
    return {
        "status": "ok",
        "llm": chain[0] if chain else "template",
        "llm_chain": [*chain, "template"],
        "llm_model": (
            config.GEMINI_MODEL
            if config.gemini_enabled()
            else config.OLLAMA_MODEL if config.ollama_enabled() else None
        ),
        "gemini_model": config.GEMINI_MODEL if config.gemini_enabled() else None,
        "ollama_model": config.OLLAMA_MODEL if config.ollama_enabled() else None,
        "ollama_base_url": config.OLLAMA_BASE_URL if config.ollama_enabled() else None,
        "cache_ttl_seconds": config.CACHE_TTL_SECONDS,
        "detection": f"{config.DETECTION_MODULE}.{config.DETECTION_FUNCTION}",
        "detector": _detector_summary(),
        "policy": policy.POLICY_VERSION,
        "calibration": calibration.load().version,
    }


@app.get("/model", tags=["meta"])
def get_model() -> dict:
    """The full detector report: dataset, time split, metrics, thresholds.

    This is the evidence behind the dashboard's alerts — the exact numbers
    the training pipeline measured on the held-out test window.
    """
    metrics_path = Path(config.DETECTOR_METRICS_PATH)
    if not metrics_path.exists():
        raise HTTPException(
            status_code=503,
            detail=(
                "No detector metrics yet — run "
                "`python training/train_detector.py` first."
            ),
        )
    report = json.loads(metrics_path.read_text(encoding="utf-8"))
    artifact = Path(config.DETECTED_RINGS_PATH)
    if artifact.exists():
        payload = json.loads(artifact.read_text(encoding="utf-8"))
        report["alert_artifact"] = payload.get("source")
    return report


@app.get("/policy", tags=["meta"])
def get_policy() -> dict:
    """The decision policy and calibration curve, published in full.

    Nothing here is hidden: this is the matrix that turns P(fraud) into a
    recommended action, and the curve that turned the score into P(fraud).
    """
    return {
        **policy.policy_summary(),
        "calibration": calibration.load().summary(),
        "calibration_note": (
            "Fitted offline on the synthetic labelled rings in app/labelled.py; "
            "override with data/calibration.json. A production deployment would "
            "refit on confirmed cases."
        ),
    }


@app.get("/alerts", response_model=AlertsResponse, tags=["alerts"])
async def list_alerts() -> AlertsResponse:
    """All rings as alerts in the shared format.

    `source` is "detection" (Person 1's function ran) or "fake";
    `cached` is true when every explanation came from the in-memory cache;
    `detection_error` explains why fakes were served, when that happened.
    """
    # Detection may walk 100k rows — keep it off the event loop.
    rings, source, detection_error = await asyncio.to_thread(get_rings)
    # Explanations for several rings are requested in parallel (asyncio.gather).
    results = await asyncio.gather(*(build_alert(facts) for facts in rings))
    alerts = [alert for alert, _ in results]
    hits = [hit for _, hit in results]
    return AlertsResponse(
        alerts=alerts,
        count=len(alerts),
        source=source,
        cached=bool(hits) and all(hits),
        generated_at=datetime.now(timezone.utc),
        detection_error=detection_error,
    )


@app.get("/alerts/{ring_id}", response_model=Alert, tags=["alerts"])
async def get_alert(ring_id: str) -> Alert:
    """One alert by ring id, e.g. for a selected node on the dashboard."""
    rings, _, _ = await asyncio.to_thread(get_rings)
    facts = next((ring for ring in rings if ring.ring_id == ring_id), None)
    if facts is None:
        raise HTTPException(status_code=404, detail=f"No ring {ring_id!r}")
    alert, _ = await build_alert(facts)
    return alert


# Serve the built dashboard (frontend/dist) at "/" when it exists, so one
# process and one URL serve both the UI and the API (LAN/tunnel demos).
# Declared last on purpose: API routes above always win.
_DASHBOARD_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _DASHBOARD_DIR.is_dir():
    app.mount("/", StaticFiles(directory=_DASHBOARD_DIR, html=True), name="dashboard")
    log.info("serving dashboard from %s", _DASHBOARD_DIR)
