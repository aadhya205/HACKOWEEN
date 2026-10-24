#!/usr/bin/env python3
"""LoRA fine-tune a small open model to write guarded fraud explanations.

Default base: Qwen/Qwen2.5-0.5B-Instruct (Apache-2.0, CPU-trainable for a
small set, small enough to run through Ollama). The dataset is the JSONL
produced by ``training/build_ft_dataset.py``.

The heavy stack (torch / transformers / peft / trl) is optional and only
imported on a real run, so the script still validates the dataset on a
machine that has not installed them:

    .venv/bin/python training/lora_finetune.py --dry-run

Real run (GPU strongly recommended):

    pip install -r training/requirements-finetune.txt
    python training/lora_finetune.py --model Qwen/Qwen2.5-0.5B-Instruct

The adapter is written to data/ft/adapter. Convert it to GGUF and register
it with Ollama (see training/README.md and training/ollama.Modelfile).
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.explanation import guardrail  # noqa: E402


@dataclass
class Report:
    train: int = 0
    validation: int = 0
    guardrail_failures: int = 0
    malformed: int = 0
    max_words: int = 0
    issues: list[str] = field(default_factory=list)


def read_jsonl(path: Path, report: Report) -> list[dict]:
    if not path.exists():
        raise SystemExit(f"{path} not found — run training/build_ft_dataset.py first")
    records: list[dict] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
                messages = record["messages"]
                assert [m["role"] for m in messages] == [
                    "system",
                    "user",
                    "assistant",
                ]
                assert all(isinstance(m["content"], str) and m["content"] for m in messages)
            except Exception as exc:  # noqa: BLE001 - report, do not crash
                report.malformed += 1
                report.issues.append(f"{path.name}:{line_number}: {exc}")
                continue

            user_content = messages[1]["content"]
            assistant_content = messages[2]["content"]
            try:
                facts = json.loads(
                    user_content.split("FACTS (JSON):\n", 1)[1].split(
                        "\n\nWrite the two sentences now.", 1
                    )[0]
                )
                if not guardrail(assistant_content, facts):
                    report.guardrail_failures += 1
                    report.issues.append(
                        f"{path.name}:{line_number}: assistant invents a number"
                    )
            except Exception as exc:  # noqa: BLE001
                report.malformed += 1
                report.issues.append(f"{path.name}:{line_number}: bad FACTS ({exc})")
                continue
            report.max_words = max(report.max_words, len(assistant_content.split()))
            records.append(record)
    return records


def check_dependencies() -> list[str]:
    missing = []
    for module in ("torch", "transformers", "peft", "trl", "datasets", "accelerate"):
        try:
            __import__(module)
        except ImportError:
            missing.append(module)
    return missing


def to_text(record: dict, tokenizer, max_length: int) -> dict:
    text = tokenizer.apply_chat_template(
        record["messages"], tokenize=False, add_generation_prompt=False
    )
    encoded = tokenizer(
        text, truncation=True, max_length=max_length, add_special_tokens=False
    )
    encoded["text"] = text
    return encoded


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train", default=str(ROOT / "data" / "ft" / "train.jsonl"))
    parser.add_argument("--val", default=str(ROOT / "data" / "ft" / "val.jsonl"))
    parser.add_argument("--model", default="Qwen/Qwen2.5-0.5B-Instruct")
    parser.add_argument("--output", default=str(ROOT / "data" / "ft" / "adapter"))
    parser.add_argument("--epochs", type=float, default=2.0)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--grad-accum", type=int, default=8)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--max-seq-len", type=int, default=1024)
    parser.add_argument("--lora-r", type=int, default=16)
    parser.add_argument("--lora-alpha", type=int, default=32)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    report = Report()
    train = read_jsonl(Path(args.train), report)
    report.train = len(train)
    validation = read_jsonl(Path(args.val), report)
    report.validation = len(validation)
    if report.malformed or report.guardrail_failures:
        print(json.dumps(report.__dict__, indent=2))
        raise SystemExit("dataset failed validation; fix it before training")

    missing = check_dependencies()
    plan = {
        "base_model": args.model,
        "train_examples": report.train,
        "validation_examples": report.validation,
        "max_answer_words": report.max_words,
        "epochs": args.epochs,
        "effective_batch_size": args.batch_size * args.grad_accum,
        "lora": {"r": args.lora_r, "alpha": args.lora_alpha, "dropout": 0.05},
        "max_seq_len": args.max_seq_len,
        "output": args.output,
        "dataset_ok": True,
        "missing_dependencies": missing,
    }
    print(json.dumps(plan, indent=2))
    if args.dry_run:
        print(
            "\nDry run only: dataset is valid and the training plan above is "
            "ready. Install training/requirements-finetune.txt to train."
        )
        return 0
    if missing:
        raise SystemExit(
            "missing fine-tuning dependencies: "
            + ", ".join(missing)
            + "\n  pip install -r training/requirements-finetune.txt"
        )

    # Imports live here so --dry-run works in the light backend venv.
    import torch
    from datasets import Dataset
    from peft import LoraConfig, get_peft_model
    from transformers import (
        AutoModelForCausalLM,
        AutoTokenizer,
        TrainingArguments,
    )
    from trl import SFTTrainer

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
    model = AutoModelForCausalLM.from_pretrained(
        args.model, torch_dtype=dtype, device_map="auto" if torch.cuda.is_available() else None
    )
    model.config.use_cache = False

    lora = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=[
            "q_proj",
            "k_proj",
            "v_proj",
            "o_proj",
            "gate_proj",
            "up_proj",
            "down_proj",
        ],
    )
    model = get_peft_model(model, lora)

    def prepare(record: dict) -> dict:
        return to_text(record, tokenizer, args.max_seq_len)

    train_ds = Dataset.from_list(train).map(prepare, remove_columns=["messages", "meta"])
    val_ds = Dataset.from_list(validation).map(
        prepare, remove_columns=["messages", "meta"]
    )

    training_args = TrainingArguments(
        output_dir=args.output,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        warmup_ratio=0.03,
        logging_steps=5,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=2,
        report_to=[],
        remove_unused_columns=False,
        use_cpu=not torch.cuda.is_available(),
    )
    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        processing_class=tokenizer,
    )
    trainer.train()
    trainer.save_model(args.output)
    tokenizer.save_pretrained(args.output)

    metrics = trainer.evaluate()
    (Path(args.output) / "eval_metrics.json").write_text(
        json.dumps(metrics, indent=2) + "\n"
    )
    print(f"adapter saved to {args.output}")
    print(json.dumps(metrics, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
