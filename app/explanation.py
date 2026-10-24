"""Four-stage explanation: Gemini -> local Ollama -> guardrail -> template.

1. Gemini free tier (only when GEMINI_API_KEY is set, hard timeout).
2. Local Ollama model (no API key, no data leaves the machine). This is the
   layer the fine-tuned adapter plugs into once it is exported as a GGUF.
3. Guardrail: every number in the reply must appear in the facts payload we
   sent — otherwise the reply is discarded, whichever model wrote it. This is
   what lets us say "the model cannot invent an amount".
4. Fill-in-the-blank template built from the same facts, so the demo (and
   the endpoint) never breaks when Wi-Fi, Gemini, or Ollama dies.

With neither provider available the layer is keyless: template only.
"""

from __future__ import annotations

import json
import logging
import math
import re
from typing import Any, Literal

import httpx

from . import config
from .models import RingFacts
from .scoring import amount_similarity, resolve_total, resolve_window

log = logging.getLogger("explanation")

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)

ExplanationSource = Literal["gemini", "ollama", "template"]

SYSTEM_INSTRUCTION = (
    "You explain bank fraud alerts in plain English for a demo dashboard.\n"
    "Return exactly two sentences and nothing else: no markdown, no preamble, "
    "no bullet points, no line breaks.\n"
    "Sentence 1: what the accounts did, as a pattern, using only the numbers "
    "in the FACTS json.\n"
    "Sentence 2: what the risk score means and that a human analyst makes the "
    "final decision.\n"
    "Rules: use ONLY numbers that appear in the FACTS json — never invent, "
    "round or recompute one. Money stays a plain number with no currency "
    "symbol."
)

NUMBER_RE = re.compile(r"-?\d+(?:,\d{3})*(?:\.\d+)?")
SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")


def build_facts_payload(facts: RingFacts, risk: int) -> dict[str, Any]:
    """The exact numbers the model is allowed to use (and the guardrail checks)."""
    window, _ = resolve_window(facts)
    similarity, _ = amount_similarity(facts)
    payload: dict[str, Any] = {
        "ring_id": facts.ring_id,
        "account_ids": facts.accounts,
        "num_accounts": len(facts.accounts),
        "num_edges": len(facts.edges),
        "time_window_seconds": int(round(window)),
        "time_window_minutes": round(window / 60.0, 1),
        "total_amount": round(resolve_total(facts), 2),
        "amount_similarity_0_to_1": round(similarity, 2),
        "risk_score_0_to_100": risk,
        "score_max": 100,
    }
    if facts.new_accounts is not None:
        payload["num_new_accounts"] = int(facts.new_accounts)
    if facts.pattern is not None:
        payload["pattern"] = facts.pattern
    if facts.anomaly_score is not None:
        payload["anomaly_score_0_to_1"] = round(float(facts.anomaly_score), 2)
    return payload


# --- guardrail ---------------------------------------------------------------


def extract_numbers(text: str) -> list[float]:
    return [float(match.replace(",", "")) for match in NUMBER_RE.findall(text)]


def _close(left: float, right: float) -> bool:
    return math.isclose(left, right, rel_tol=1e-3, abs_tol=0.011)


def guardrail(text: str, payload: dict[str, Any]) -> bool:
    """True when every number in `text` also appears in the facts payload."""
    allowed = extract_numbers(json.dumps(payload))
    produced = extract_numbers(text)
    return all(any(_close(value, allowed_value) for allowed_value in allowed)
               for value in produced)


def clean_reply(raw: str) -> str:
    """Strip markdown/quotes and keep at most the first two sentences."""
    text = raw.strip().strip("\"'\u201c\u201d\u2018\u2019")
    text = re.sub(r"[*_`#>]+", "", text)
    text = " ".join(text.split())
    sentences = [part.strip() for part in SENTENCE_RE.split(text) if part.strip()]
    return " ".join(sentences[:2])


# --- layer 3: template -------------------------------------------------------


def template_explanation(facts: RingFacts, risk: int, payload: dict[str, Any]) -> str:
    """Fill-in-the-blank backup built only from numbers already in the payload."""
    window_seconds = payload["time_window_seconds"]
    minutes = payload["time_window_minutes"]
    # :g keeps "1.8" but turns "330.0" into "330" — no dangling decimals.
    time_phrase = (
        f"{minutes:g} minutes" if minutes >= 1 else f"{window_seconds} seconds"
    )
    total = f"{payload['total_amount']:,.0f}"
    edges = payload["num_edges"]
    similarity = payload["amount_similarity_0_to_1"]
    if similarity >= 0.8:
        chunks = "near-identical amounts"
    elif similarity >= 0.5:
        chunks = "similar amounts"
    else:
        chunks = "varying amounts"

    new_accounts = payload.get("num_new_accounts")
    if new_accounts:
        singular = new_accounts == 1
        accounts_word = "account" if singular else "accounts"
        verb = "was" if singular else "were"
        first = (
            f"{new_accounts} first-time receiver {accounts_word} in ring "
            f"{facts.ring_id} {verb} paid {chunks} within {time_phrase} and forwarded "
            f"the money onward, moving {total} in total across {edges} transfers."
        )
    else:
        first = (
            f"{payload['num_accounts']} linked accounts in ring {facts.ring_id} "
            f"moved {total} across {edges} transfers within {time_phrase}, "
            f"split into {chunks}."
        )
    second = (
        f"The weighted risk score is {risk} out of 100, and a human analyst "
        f"makes the final call."
    )
    return f"{first} {second}"


# --- layer 1: Gemini ---------------------------------------------------------


async def _call_gemini(payload: dict[str, Any]) -> str:
    """One bounded call to the Gemini free tier. Raises on any failure."""
    url = GEMINI_URL.format(model=config.GEMINI_MODEL)
    body = {
        "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            "FACTS (JSON):\n"
                            + json.dumps(payload)
                            + "\n\nWrite the two sentences now."
                        )
                    }
                ],
            }
        ],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 200},
    }
    timeout = httpx.Timeout(
        config.LLM_TIMEOUT_SECONDS,
        connect=min(2.0, config.LLM_TIMEOUT_SECONDS),
    )
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            url,
            json=body,
            headers={"x-goog-api-key": config.GEMINI_API_KEY},
        )
        response.raise_for_status()
        data = response.json()
    candidates = data.get("candidates") or []
    parts = candidates[0]["content"]["parts"] if candidates else []
    return "".join(part.get("text", "") for part in parts)


async def _call_ollama(payload: dict[str, Any]) -> str:
    """One bounded chat call to a local Ollama server. Raises on any failure."""
    body = {
        "model": config.OLLAMA_MODEL,
        "stream": False,
        "messages": [
            {"role": "system", "content": SYSTEM_INSTRUCTION},
            {
                "role": "user",
                "content": (
                    "FACTS (JSON):\n"
                    + json.dumps(payload)
                    + "\n\nWrite the two sentences now."
                ),
            },
        ],
        "options": {"temperature": 0.2, "num_predict": 200},
    }
    timeout = httpx.Timeout(
        config.OLLAMA_TIMEOUT_SECONDS,
        connect=min(2.0, config.OLLAMA_TIMEOUT_SECONDS),
    )
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(f"{config.OLLAMA_BASE_URL}/api/chat", json=body)
        response.raise_for_status()
        data = response.json()
    return (data.get("message") or {}).get("content", "")


# --- provider chain ----------------------------------------------------------

# Resolve the caller by name at call time, not at import time, so tests and
# operators can substitute a provider without rebuilding the chain.
_CHAIN = {"gemini": "_call_gemini", "ollama": "_call_ollama"}


def _accept(raw: str, payload: dict[str, Any]) -> str | None:
    """Clean a model reply and apply the length + number guardrails."""
    reply = clean_reply(raw or "")
    if len(reply.split()) < 6:
        log.warning("LLM reply too short; trying the next layer")
        return None
    if not guardrail(reply, payload):
        log.warning("LLM reply failed the number guardrail; trying the next layer")
        return None
    return reply


async def explain_ring(
    facts: RingFacts, risk: int
) -> tuple[str, ExplanationSource]:
    """Return (explanation, source). Never raises, never blocks past a timeout.

    Gemini is tried first when configured, then the local Ollama model, then
    the template. Any number the model invents discards that model's reply,
    so a bad layer can only cost latency — never accuracy.
    """
    payload = build_facts_payload(facts, risk)

    for provider in config.llm_chain():
        caller = globals()[_CHAIN[provider]]
        try:
            raw = await caller(payload)
        except Exception as exc:  # timeout, 429, 5xx, bad JSON — all non-fatal
            log.warning(
                "%s unavailable (%s: %s); trying the next layer",
                provider,
                type(exc).__name__,
                exc,
            )
            continue
        reply = _accept(raw, payload)
        if reply is not None:
            return reply, provider  # type: ignore[return-value]

    return template_explanation(facts, risk, payload), "template"
