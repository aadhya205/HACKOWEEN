"""Person 1 detection hook — serves the rings produced by the ML pipeline.

The heavy work happens offline in ``training/train_detector.py``:

    PaySim 63.6 lakh rows -> HistGradientBoosting -> transaction risk
    -> dense 2-hour neighbourhoods -> scored rings -> data/detected_rings.json

This module is the thin serving seam the backend already expects. It reads
that artifact and returns plain dicts in the shared ring format. Keeping
pandas/sklearn out of the API process means the dashboard starts fast and
the trained model can be retrained without touching the web service.

Missing artifact -> FileNotFoundError, which ``app.ring_source`` reports as
``detection_error`` and covers with the built-in fake rings (the demo never
hard-breaks).
"""

from __future__ import annotations

import json
from pathlib import Path

from app import config


def _artifact_path() -> Path:
    return Path(config.DETECTED_RINGS_PATH)


def detector_metadata() -> dict:
    """Provenance for the current ring artifact (rows scanned, metrics, ...)."""
    payload = json.loads(_artifact_path().read_text(encoding="utf-8"))
    return {
        "generated_at": payload.get("generated_at"),
        **(payload.get("source") or {}),
        "rings": len(payload.get("rings") or []),
        "artifact": str(_artifact_path()),
    }


def find_rings() -> list[dict]:
    """All detected rings, ready for validation into RingFacts."""
    path = _artifact_path()
    if not path.exists():
        raise FileNotFoundError(
            f"{path} is missing — run `python training/train_detector.py` first"
        )
    payload = json.loads(path.read_text(encoding="utf-8"))
    return list(payload.get("rings") or [])
