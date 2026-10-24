"""Environment settings. All values come from .env (see .env.example).

Tests monkeypatch the module attributes (e.g. ``config.GEMINI_API_KEY``),
so always read settings as ``config.X``, never ``from .config import X``.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "3.5"))
LLM_ENABLED = _bool("LLM_ENABLED", True)

# --- local LLM (Ollama) ---------------------------------------------
# Tried after Gemini (or first when no Gemini key is set). Needs a running
# Ollama server and a pulled model; `ollama pull qwen2.5:3b-instruct` is a
# good CPU-friendly default for this task.
OLLAMA_ENABLED = _bool("OLLAMA_ENABLED", True)
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b-instruct")
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "8.0"))

CACHE_TTL_SECONDS = float(os.getenv("CACHE_TTL_SECONDS", "600"))
DETECTION_CACHE_TTL_SECONDS = float(os.getenv("DETECTION_CACHE_TTL_SECONDS", "60"))

DETECTION_MODULE = os.getenv("DETECTION_MODULE", "detection")
DETECTION_FUNCTION = os.getenv("DETECTION_FUNCTION", "find_rings")
FALLBACK_TO_FAKE_WHEN_EMPTY = _bool("FALLBACK_TO_FAKE_WHEN_EMPTY", False)

# Ring artifact produced by training/train_detector.py on the full PaySim CSV.
DETECTED_RINGS_PATH = os.getenv("DETECTED_RINGS_PATH", "data/detected_rings.json")
DETECTOR_METRICS_PATH = os.getenv("DETECTOR_METRICS_PATH", "data/model/metrics.json")

FAKE_ALERTS_PATH = os.getenv("FAKE_ALERTS_PATH", "data/fake_alerts.json")

# Committed calibration curve (score -> P(fraud)). Missing file = fit on the
# labelled dataset in app/labelled.py at first use.
CALIBRATION_PATH = os.getenv("CALIBRATION_PATH", "data/calibration.json")

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "*").split(",")
    if origin.strip()
]


def gemini_enabled() -> bool:
    """True only when we should actually call Gemini."""
    return LLM_ENABLED and bool(GEMINI_API_KEY)


def ollama_enabled() -> bool:
    """True when the local Ollama layer is allowed to run."""
    return LLM_ENABLED and OLLAMA_ENABLED


def llm_enabled() -> bool:
    """Backwards-compatible alias: is any remote/local model configured?"""
    return gemini_enabled() or ollama_enabled()


def llm_chain() -> list[str]:
    """Providers in the order they are tried, before the template."""
    chain: list[str] = []
    if gemini_enabled():
        chain.append("gemini")
    if ollama_enabled():
        chain.append("ollama")
    return chain
