"""Where rings come from: Person 1's detection if it exists, fakes otherwise.

Contract for Person 1 (see README): expose a callable
``find_rings() -> list[ring dict]`` in ``detection.py`` at the repo root
(no arguments — load your data inside). Module and function names are
overridable with DETECTION_MODULE / DETECTION_FUNCTION.

Failure policy (plan section 9: "the demo never breaks"):
  * no detection module        -> built-in / Person 4 fake alerts
  * detection raises           -> fake alerts, error surfaced as detection_error
  * detection returns []       -> [] honestly, unless FALLBACK_TO_FAKE_WHEN_EMPTY
Results are cached for DETECTION_CACHE_TTL_SECONDS so a dashboard refresh
doesn't re-run detection over 100k rows.
"""

from __future__ import annotations

import importlib
import inspect
import json
import logging
import threading
from pathlib import Path
from typing import Any, Callable

from . import config
from .cache import TTLCache
from .fake_rings import FAKE_RINGS
from .models import RingFacts

log = logging.getLogger("ring_source")

ring_cache = TTLCache(config.DETECTION_CACHE_TTL_SECONDS)
_lock = threading.Lock()
_CACHE_KEY = "rings"


def _person1_function() -> Callable[[], Any] | None:
    try:
        module = importlib.import_module(config.DETECTION_MODULE)
        function = getattr(module, config.DETECTION_FUNCTION)
    except (ImportError, AttributeError) as exc:
        log.info("Person 1 detection not available: %s", exc)
        return None
    if not callable(function):
        log.warning("%s.%s is not callable", config.DETECTION_MODULE,
                    config.DETECTION_FUNCTION)
        return None
    return function


def _invoke(function: Callable[[], Any]) -> Any:
    """Call the detection function, tolerating a single optional data arg."""
    required = [
        parameter
        for parameter in inspect.signature(function).parameters.values()
        if parameter.default is parameter.empty
        and parameter.kind
        in (parameter.POSITIONAL_ONLY, parameter.POSITIONAL_OR_KEYWORD)
    ]
    if not required:
        return function()
    return function(None)


def _validate(raw: Any) -> tuple[list[RingFacts], list[str]]:
    facts: list[RingFacts] = []
    invalid: list[str] = []
    for item in raw or []:
        try:
            facts.append(
                item if isinstance(item, RingFacts) else RingFacts.model_validate(item)
            )
        except Exception as exc:  # one bad ring must not kill the batch
            invalid.append(str(exc).splitlines()[0][:200])
    return facts, invalid


def _from_fake(error: str | None) -> tuple[list[RingFacts], str, str | None]:
    return _load_fake_alerts(), "fake", error


def _load_fake_alerts() -> list[RingFacts]:
    """Person 4's data/fake_alerts.json if present, else the built-ins."""
    path = Path(config.FAKE_ALERTS_PATH)
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            items = data.get("alerts", data) if isinstance(data, dict) else data
            facts, invalid = _validate(items)
            if facts:
                if invalid:
                    log.warning("fake_alerts.json: %s ring(s) skipped: %s",
                                len(invalid), invalid[0])
                log.info("serving %d fake alert(s) from %s", len(facts), path)
                return facts
            log.warning("fake_alerts.json had no valid rings: %s",
                        invalid[0] if invalid else "empty file")
        except Exception:
            log.exception("could not read %s; using built-in fakes", path)
    return list(FAKE_RINGS)


def _load() -> tuple[list[RingFacts], str, str | None]:
    function = _person1_function()
    if function is None:
        return _from_fake(None)

    try:
        raw = _invoke(function)
    except Exception as exc:
        log.exception("Person 1 detection raised; serving fake alerts")
        return _from_fake(f"detection failed: {type(exc).__name__}: {exc}")

    facts, invalid = _validate(raw)
    error: str | None = None
    if invalid:
        error = f"{len(invalid)} ring(s) failed validation: {invalid[0]}"
        log.warning("%s", error)

    if not facts and config.FALLBACK_TO_FAKE_WHEN_EMPTY:
        return _from_fake(error or "detection returned 0 rings; serving fakes")
    return facts, "detection", error


def get_rings() -> tuple[list[RingFacts], str, str | None]:
    """(rings, source, detection_error), cached for DETECTION_CACHE_TTL.

    source is "detection" when Person 1's function ran, "fake" otherwise.
    """
    with _lock:
        cached = ring_cache.get(_CACHE_KEY)
        if cached is not None:
            return cached
        result = _load()
        ring_cache.set(_CACHE_KEY, result)
        return result
