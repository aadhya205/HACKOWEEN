"""Vercel serverless entry point — exposes the FastAPI app via Mangum."""

import sys
from pathlib import Path

# Ensure the project root is on sys.path so `app` and `detection` are importable.
_root = str(Path(__file__).resolve().parent.parent)
if _root not in sys.path:
    sys.path.insert(0, _root)

from mangum import Mangum  # noqa: E402
from app.main import app  # noqa: E402

# Mangum wraps the ASGI app for AWS Lambda / Vercel serverless.
handler = Mangum(app, lifespan="off")
