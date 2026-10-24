#!/usr/bin/env python3
"""Turn detected rings into a fine-tuning dataset for the local LLM.

Each example is the exact prompt the backend sends at serve time (system
instruction + FACTS json) paired with the guardrailed template explanation
as the gold answer. Variants jitter amounts, timing, and edge count so the
model learns the *format and reasoning*, not eight memorised rings.

Leakage safety: every variant of a ring lands in the same split. The
validation file therefore measures generalisation to unseen rings.

Run:
    .venv/bin/python training/build_ft_dataset.py
        [--rings data/detected_rings.json] [--out data/ft]
        [--per-ring 60] [--seed 11]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys
from datetime import timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.explanation import (  # noqa: E402
    SYSTEM_INSTRUCTION,
    build_facts_payload,
    guardrail,
    template_explanation,
)
from app.fake_rings import FAKE_RINGS  # noqa: E402
from app.models import Edge, RingFacts  # noqa: E402
from app.scoring import score_ring  # noqa: E402


def load_base_rings(path: Path) -> list[RingFacts]:
    if not path.exists():
        raise SystemExit(
            f"{path} not found — run `python training/train_detector.py` first"
        )
    payload = json.loads(path.read_text(encoding="utf-8"))
    rings = [RingFacts.model_validate(item) for item in payload.get("rings") or []]
    if not rings:
        raise SystemExit(f"{path} contains no rings")
    return rings


def make_variant(base: RingFacts, index: int, rng: random.Random) -> RingFacts:
    """Jitter a ring while keeping it a plausible version of the same pattern."""
    facts = base.model_copy(deep=True)
    facts.ring_id = f"{base.ring_id}-V{index:03d}"

    # Independent log-normal-ish jitter per edge, then a ring-wide scale.
    scale = rng.uniform(0.55, 1.8)
    shifted: list[Edge] = []
    for edge in base.edges:
        amount = edge.amount * scale * rng.uniform(0.82, 1.18)
        timestamp = edge.timestamp
        if timestamp is not None:
            timestamp = timestamp + timedelta(
                minutes=rng.randint(-45, 45), seconds=rng.randint(0, 59)
            )
        shifted.append(
            Edge(
                source=edge.source,
                target=edge.target,
                amount=max(round(amount, 2), 1.0),
                timestamp=timestamp,
            )
        )
    # Occasionally drop one edge (never below three) to vary ring shape.
    if len(shifted) > 4 and rng.random() < 0.25:
        shifted.pop(rng.randrange(len(shifted)))
    facts.edges = shifted
    facts.accounts = list(dict.fromkeys(
        [account for edge in shifted for account in (edge.source, edge.target)]
    ))
    facts.total_amount = round(sum(edge.amount for edge in shifted), 2)
    stamps = [edge.timestamp for edge in shifted if edge.timestamp is not None]
    if len(stamps) >= 2:
        facts.time_window_seconds = float((max(stamps) - min(stamps)).total_seconds())
    if facts.new_accounts is not None:
        facts.new_accounts = min(
            len(facts.accounts), max(0, facts.new_accounts + rng.randint(-1, 1))
        )
    return facts


def example_for(facts: RingFacts) -> tuple[dict, bool]:
    risk, _ = score_ring(facts)
    payload = build_facts_payload(facts, risk)
    answer = template_explanation(facts, risk, payload)
    passes = guardrail(answer, payload)
    record = {
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
            {"role": "assistant", "content": answer},
        ],
        "meta": {
            "ring_id": facts.ring_id,
            "risk": risk,
            "base_ring": facts.ring_id.split("-V")[0],
            "pattern": facts.pattern,
            "guardrail_pass": passes,
        },
    }
    return record, passes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rings", default=str(ROOT / "data" / "detected_rings.json"))
    parser.add_argument("--out", default=str(ROOT / "data" / "ft"))
    parser.add_argument("--per-ring", type=int, default=60)
    parser.add_argument("--seed", type=int, default=11)
    parser.add_argument(
        "--no-demo-rings",
        action="store_true",
        help="Only use PaySim-detected rings (skip the two built-in demo rings)",
    )
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)

    bases = load_base_rings(Path(args.rings))
    if not args.no_demo_rings:
        # The two built-in rings are hand-built typologies: good extra variety.
        bases = [*bases, *FAKE_RINGS]

    # Split by base ring so no variant of a ring is seen in both files.
    # Every fourth ring is held out, which keeps both PaySim and demo
    # typologies represented in validation without hand-picking favourites.
    validation_bases = {
        ring.ring_id for index, ring in enumerate(bases) if index % 4 == 3
    }
    if not validation_bases:  # tiny custom artifact
        validation_bases = {bases[-1].ring_id}

    train: list[dict] = []
    validation: list[dict] = []
    guardrail_passes = 0
    seen: set[str] = set()
    for base in bases:
        for index in range(args.per_ring):
            variant = make_variant(base, index, rng)
            record, passes = example_for(variant)
            if not passes:
                continue
            digest = hashlib.sha256(
                json.dumps(record["messages"], sort_keys=True).encode()
            ).hexdigest()
            if digest in seen:
                continue
            seen.add(digest)
            guardrail_passes += passes
            (validation if base.ring_id in validation_bases else train).append(record)

    # Keep the split deterministic even if the base artifact is regenerated.
    rng.shuffle(train)
    rng.shuffle(validation)

    for name, records in (("train", train), ("val", validation)):
        path = out_dir / f"{name}.jsonl"
        with path.open("w", encoding="utf-8") as handle:
            for record in records:
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")

    manifest = {
        "created_by": "training/build_ft_dataset.py",
        "seed": args.seed,
        "per_ring": args.per_ring,
        "base_rings": [ring.ring_id for ring in bases],
        "validation_rings": sorted(validation_bases),
        "train_examples": len(train),
        "validation_examples": len(validation),
        "guardrail_pass_rate": round(
            guardrail_passes / max(len(train) + len(validation), 1), 4
        ),
        "format": "OpenAI-style chat messages (system/user/assistant), JSONL",
        "target_model": "Qwen/Qwen2.5-0.5B-Instruct",
        "note": (
            "Answers are the number-guardrailed template, so a fine-tuned "
            "model learns the house style without ever inventing a figure."
        ),
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

    print(
        f"wrote {len(train)} train / {len(validation)} validation examples "
        f"from {len(bases)} rings ({guardrail_passes} guardrail-checked)"
    )
    print(f"-> {out_dir / 'train.jsonl'}")
    print(f"-> {out_dir / 'val.jsonl'}")
    print(f"-> {out_dir / 'manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
