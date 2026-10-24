#!/usr/bin/env python3
"""Train the transaction detector on the full PaySim ledger and build rings.

This is the offline half of the ML stack:

    PaySim CSV (63.6 lakh rows)
        -> leakage-safe time split
        -> 11 behavioural features per TRANSFER / CASH_OUT
        -> HistGradientBoostingClassifier (fraud vs legitimate)
        -> honest test metrics at a validation-tuned threshold
        -> score every transaction, group high-risk neighbourhoods into rings
        -> data/model/detector.joblib + metrics.json
        -> data/detected_rings.json  (consumed by detection.py at serve time)

`detection.py` never trains and never imports sklearn: it reads the ring
artifact produced here, so the API stays light while the heavy maths happens
in this reproducible batch job.

Run:
    .venv/bin/python training/train_detector.py
        [--csv data/paysim.csv] [--out data/model]
        [--train-negatives 400000] [--max-rings 8]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    precision_recall_fscore_support,
    roc_auc_score,
)

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.models import Edge, RingFacts  # noqa: E402
from app.scoring import score_ring  # noqa: E402

FEATURES = [
    "amount",
    "log_amount",
    "orig_old_balance",
    "orig_new_balance",
    "dest_old_balance",
    "dest_new_balance",
    "orig_zeroed",
    "dest_was_empty",
    "amount_to_balance",
    "orig_balance_error",
    "dest_balance_error",
    "is_transfer",
    "step_of_day",
]
MODELED_TYPES = ("TRANSFER", "CASH_OUT")
STEP_ORIGIN = datetime(2025, 10, 1, tzinfo=timezone.utc)

DTYPES = {
    "step": "int32",
    "type": "category",
    "amount": "float64",
    "nameOrig": "string",
    "oldbalanceOrg": "float64",
    "newbalanceOrig": "float64",
    "nameDest": "string",
    "oldbalanceDest": "float64",
    "newbalanceDest": "float64",
    "isFraud": "int8",
    "isFlaggedFraud": "int8",
}
USECOLS = list(DTYPES)


def log(message: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Model-ready features. No account IDs, no labels: nothing to memorise."""
    out = pd.DataFrame(index=df.index)
    amount = df["amount"].astype("float64")
    out["amount"] = amount
    out["log_amount"] = np.log1p(amount)
    out["orig_old_balance"] = df["oldbalanceOrg"]
    out["orig_new_balance"] = df["newbalanceOrig"]
    out["dest_old_balance"] = df["oldbalanceDest"]
    out["dest_new_balance"] = df["newbalanceDest"]
    out["orig_zeroed"] = (df["newbalanceOrig"] == 0).astype("int8")
    out["dest_was_empty"] = (df["oldbalanceDest"] == 0).astype("int8")
    out["amount_to_balance"] = amount / (df["oldbalanceOrg"].abs() + 1.0)
    # PaySim carries deliberate balance inconsistencies; they are a strong
    # signal and cost nothing to compute.
    out["orig_balance_error"] = (
        (df["oldbalanceOrg"] - amount - df["newbalanceOrig"]).abs() > 1e-2
    ).astype("int8")
    out["dest_balance_error"] = (
        (df["oldbalanceDest"] + amount - df["newbalanceDest"]).abs() > 1e-2
    ).astype("int8")
    out["is_transfer"] = (df["type"] == "TRANSFER").astype("int8")
    out["step_of_day"] = (df["step"] % 24).astype("int16")
    return out[FEATURES].astype("float32")


def split_by_step(df: pd.DataFrame) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Time split: train 70%, validation 10%, test 20% of the step range."""
    train_end = int(df["step"].quantile(0.70))
    val_end = int(df["step"].quantile(0.80))
    return (
        df["step"] <= train_end,
        (df["step"] > train_end) & (df["step"] <= val_end),
        df["step"] > val_end,
    )


def sampled_training_frame(
    X: pd.DataFrame, y: pd.Series, negatives: int, seed: int = 7
) -> tuple[pd.DataFrame, pd.Series]:
    """Keep every fraud row and a random sample of legitimate rows."""
    positives = y.index[y == 1].to_numpy()
    negatives_index = y.index[y == 0].to_numpy()
    chosen = np.random.default_rng(seed).choice(
        negatives_index, size=min(negatives, len(negatives_index)), replace=False
    )
    keep = np.concatenate([positives, chosen])
    return X.loc[keep], y.loc[keep]


def choose_threshold(y_true: pd.Series, probabilities: np.ndarray) -> dict:
    """Pick the F1-optimal threshold on validation, plus a precision-first one."""
    best = {"threshold": 0.5, "f1": -1.0}
    precision_first = {"threshold": 0.5, "precision": -1.0}
    for threshold in np.arange(0.02, 0.99, 0.01):
        predicted = probabilities >= threshold
        precision, recall, f1, _ = precision_recall_fscore_support(
            y_true, predicted, average="binary", zero_division=0
        )
        if f1 > best["f1"]:
            best = {
                "threshold": round(float(threshold), 3),
                "f1": round(float(f1), 4),
                "precision": round(float(precision), 4),
                "recall": round(float(recall), 4),
            }
        if precision >= 0.90 and precision > precision_first["precision"]:
            precision_first = {
                "threshold": round(float(threshold), 3),
                "precision": round(float(precision), 4),
                "recall": round(float(recall), 4),
            }
    best["precision_first"] = precision_first
    return best


def evaluate(
    name: str,
    y_true: pd.Series,
    probabilities: np.ndarray,
    amounts: np.ndarray,
    thresholds: list[float],
    rule: pd.Series | None = None,
) -> dict:
    """PR-AUC / ROC-AUC and a confusion matrix at each candidate threshold."""
    report: dict = {
        "split": name,
        "rows": int(len(y_true)),
        "frauds": int(y_true.sum()),
        "fraud_rate": round(float(y_true.mean()), 6),
        "pr_auc": round(float(average_precision_score(y_true, probabilities)), 4),
        "roc_auc": round(float(roc_auc_score(y_true, probabilities)), 4),
        "at_thresholds": [],
    }
    for threshold in thresholds:
        predicted = probabilities >= threshold
        precision, recall, f1, _ = precision_recall_fscore_support(
            y_true, predicted, average="binary", zero_division=0
        )
        tn, fp, fn, tp = confusion_matrix(y_true, predicted, labels=[0, 1]).ravel()
        caught = amounts[(y_true == 1).to_numpy() & predicted].sum()
        total_fraud = amounts[(y_true == 1).to_numpy()].sum()
        report["at_thresholds"].append(
            {
                "threshold": round(float(threshold), 3),
                "precision": round(float(precision), 4),
                "recall": round(float(recall), 4),
                "f1": round(float(f1), 4),
                "true_positives": int(tp),
                "false_positives": int(fp),
                "false_negatives": int(fn),
                "true_negatives": int(tn),
                "alert_rate": round(float(predicted.mean()), 6),
                "fraud_amount_caught": round(float(caught), 2),
                "fraud_amount_caught_pct": round(
                    float(caught / total_fraud * 100) if total_fraud else 0.0, 2
                ),
            }
        )
    if rule is not None:
        rule_pred = rule.astype(bool).to_numpy()
        precision, recall, f1, _ = precision_recall_fscore_support(
            y_true, rule_pred, average="binary", zero_division=0
        )
        report["existing_rule_baseline"] = {
            "precision": round(float(precision), 4),
            "recall": round(float(recall), 4),
            "f1": round(float(f1), 4),
            "alerts": int(rule_pred.sum()),
        }
    return report


# --- ring construction -------------------------------------------------------


def account_activity_index(df: pd.DataFrame, accounts: set[str]) -> dict[str, np.ndarray]:
    """Row indices touching each watched account (sender or receiver)."""
    index: dict[str, list[int]] = {account: [] for account in accounts}
    origin = df["nameOrig"].to_numpy()
    destination = df["nameDest"].to_numpy()
    # One pass over the two ID columns is much cheaper than a per-account mask.
    for position, (source, target) in enumerate(zip(origin, destination)):
        if source in index:
            index[source].append(position)
        if target in index:
            index[target].append(position)
    return {account: np.asarray(rows, dtype=np.int64) for account, rows in index.items()}


def densest_window(
    rows: np.ndarray,
    steps: np.ndarray,
    probabilities: np.ndarray,
    anchors: list[int],
    max_span_steps: int = 2,
    cap: int = 14,
) -> np.ndarray:
    """Highest-risk run of transactions around this account's alert step(s).

    Windows are ranked by summed fraud probability, then by size, so a dense
    burst of ordinary transfers cannot bury the transfer that actually fired
    the alert. PaySim's clock is one hour per step, so `max_span_steps=2`
    keeps a ring inside a two-hour window; sparse accounts are skipped rather
    than padded with week-old edges.
    """
    rows = rows[np.argsort(steps[rows], kind="stable")]
    row_steps = steps[rows]
    best: np.ndarray = np.asarray([], dtype=np.int64)
    best_score = (-1.0, -1)
    for anchor in anchors:
        for start, start_step in enumerate(row_steps):
            if abs(int(start_step) - anchor) > max_span_steps:
                continue
            end = start
            while (
                end + 1 < len(rows)
                and row_steps[end + 1] - start_step <= max_span_steps
                and end - start + 1 < cap
            ):
                end += 1
            candidate = rows[start : end + 1]
            score = (round(float(probabilities[candidate].sum()), 4), len(candidate))
            if score > best_score:
                best, best_score = candidate, score
    return best


def build_rings(
    modeled: pd.DataFrame,
    probabilities: np.ndarray,
    ring_threshold: float,
    first_seen: dict[str, int],
    max_rings: int,
) -> tuple[list[RingFacts], list[dict]]:
    """Group high-risk accounts' tight transaction neighbourhoods into rings."""
    step_values = modeled["step"].to_numpy()
    amount_values = modeled["amount"].to_numpy()
    origin = modeled["nameOrig"].to_numpy()
    destination = modeled["nameDest"].to_numpy()
    flagged = probabilities >= ring_threshold

    risk_by_account: dict[str, float] = {}
    flagged_steps: dict[str, list[int]] = {}
    for position in np.flatnonzero(flagged):
        probability = float(probabilities[position])
        step = int(step_values[position])
        for account in (origin[position], destination[position]):
            risk_by_account[account] = risk_by_account.get(account, 0.0) + probability
            flagged_steps.setdefault(account, []).append(step)

    if not risk_by_account:
        return [], []

    ranked_centers = sorted(risk_by_account, key=risk_by_account.get, reverse=True)
    # Dense hubs are the mule-like collections: a high-risk transfer plus a
    # burst of activity around it. Sparse flagged accounts are skipped.
    activity = account_activity_index(modeled, set(ranked_centers))
    centers = [
        center
        for center in ranked_centers
        if len(activity.get(center, ())) >= 4
    ][:1500]

    candidates: list[RingFacts] = []
    for center in centers:
        rows = activity.get(center, np.asarray([], dtype=np.int64))
        if len(rows) < 4:
            continue
        window_rows = densest_window(
            rows,
            step_values,
            probabilities,
            sorted(set(flagged_steps.get(center, []))),
            max_span_steps=2,
            cap=14,
        )
        if len(window_rows) < 4:
            continue

        accounts: list[str] = []
        edges: list[Edge] = []
        edge_probabilities: list[float] = []
        for position in window_rows:
            source = str(origin[position])
            target = str(destination[position])
            if not source or not target:
                continue
            edge = Edge(
                source=source,
                target=target,
                amount=round(float(amount_values[position]), 2),
                timestamp=STEP_ORIGIN + timedelta(hours=int(step_values[position])),
            )
            edges.append(edge)
            for account in (source, target):
                if account not in accounts:
                    accounts.append(account)
            edge_probabilities.append(float(probabilities[position]))

        if len(accounts) < 3 or len(edges) < 3:
            continue

        steps = [int(step_values[position]) for position in window_rows]
        first = min(steps)
        last = max(steps)
        window_seconds = float((last - first) * 3600)
        new_accounts = sum(
            1 for account in accounts if first_seen.get(account, first) >= first
        )
        incoming = sum(1 for edge in edges if edge.target == center)
        outgoing = sum(1 for edge in edges if edge.source == center)
        if incoming >= 2 and outgoing >= 1:
            pattern = "fan-in to mule then cash-out"
        elif outgoing >= 2 and incoming >= 1:
            pattern = "collection account fan-out"
        elif incoming >= 2:
            pattern = "fan-in to collection account"
        else:
            pattern = "high-risk transfer chain"

        kept_accounts = accounts[:14]
        kept_edges = [
            edge
            for edge in edges
            if edge.source in kept_accounts and edge.target in kept_accounts
        ]
        facts = RingFacts(
            ring_id="PENDING",
            accounts=kept_accounts,
            edges=kept_edges,
            total_amount=round(float(sum(edge.amount for edge in kept_edges)), 2),
            time_window_seconds=window_seconds,
            new_accounts=new_accounts,
            anomaly_score=round(float(np.mean(edge_probabilities)), 3),
            pattern=pattern,
        )
        candidates.append(facts)

    # Score with the same maths the API uses, then keep the best disjoint rings.
    scored = sorted(
        ((score_ring(facts)[0], facts) for facts in candidates),
        key=lambda item: item[0],
        reverse=True,
    )
    rings: list[RingFacts] = []
    diagnostics: list[dict] = []
    used_accounts: dict[str, int] = {}
    for risk, facts in scored:
        overlap = sum(1 for account in facts.accounts if account in used_accounts)
        if overlap / max(len(facts.accounts), 1) > 0.5:
            continue
        used_accounts.update({account: len(rings) for account in facts.accounts})
        facts.ring_id = f"PS-{len(rings) + 1:03d}"
        rings.append(facts)
        diagnostics.append(
            {
                "ring_id": facts.ring_id,
                "risk": risk,
                "accounts": len(facts.accounts),
                "edges": len(facts.edges),
                "pattern": facts.pattern,
                "anomaly_score": facts.anomaly_score,
            }
        )
        if len(rings) >= max_rings:
            break
    return rings, diagnostics


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", default=str(ROOT / "data" / "paysim.csv"))
    parser.add_argument("--out", default=str(ROOT / "data" / "model"))
    parser.add_argument("--train-negatives", type=int, default=400_000)
    parser.add_argument("--max-rings", type=int, default=8)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    csv_path = Path(args.csv)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    started = time.time()

    log(f"reading {csv_path} ...")
    raw = pd.read_csv(csv_path, usecols=USECOLS, dtype=DTYPES)
    total_rows = len(raw)
    rows_by_type = {
        str(kind): int(count) for kind, count in raw["type"].value_counts().items()
    }
    log(f"rows scanned: {total_rows:,}  frauds: {int(raw['isFraud'].sum()):,}")

    # Fraud only exists in TRANSFER / CASH_OUT in PaySim. Payments, cash-ins
    # and debits carry no positive class, so they would only teach the model
    # that their type is safe. Keep them in the row count, out of training.
    modeled = raw[raw["type"].isin(MODELED_TYPES)].reset_index(drop=True)
    log(
        f"modelled rows: {len(modeled):,} "
        f"({len(modeled) / total_rows:.1%}) across {modeled['type'].nunique()} types"
    )

    log("engineering features ...")
    X = build_features(modeled)
    y = modeled["isFraud"].astype("int8")
    train_mask, val_mask, test_mask = split_by_step(modeled)
    log(
        f"time split -> train {int(train_mask.sum()):,}  "
        f"val {int(val_mask.sum()):,}  test {int(test_mask.sum()):,}"
    )

    X_train, y_train = sampled_training_frame(
        X[train_mask], y[train_mask], args.train_negatives, args.seed
    )
    log(
        f"fit sample: {len(X_train):,} rows "
        f"({int(y_train.sum()):,} frauds, {y_train.mean():.3%})"
    )

    model = HistGradientBoostingClassifier(
        max_iter=300,
        learning_rate=0.08,
        max_leaf_nodes=31,
        min_samples_leaf=40,
        l2_regularization=1.0,
        early_stopping=False,
        random_state=args.seed,
    )
    log("fitting HistGradientBoostingClassifier ...")
    model.fit(X_train, y_train)

    val_probabilities = model.predict_proba(X[val_mask])[:, 1]
    threshold_info = choose_threshold(y[val_mask], val_probabilities)
    log(f"validation threshold: {threshold_info}")

    log("scoring the held-out test window ...")
    test_probabilities = model.predict_proba(X[test_mask])[:, 1]
    test_report = evaluate(
        "test (latest 20% of steps)",
        y[test_mask],
        test_probabilities,
        modeled.loc[test_mask, "amount"].to_numpy(),
        [
            threshold_info["threshold"],
            threshold_info["precision_first"]["threshold"],
            0.5,
        ],
        rule=modeled.loc[test_mask, "isFlaggedFraud"],
    )
    validation_report = evaluate(
        "validation",
        y[val_mask],
        val_probabilities,
        modeled.loc[val_mask, "amount"].to_numpy(),
        [threshold_info["threshold"]],
    )
    log(
        f"test PR-AUC {test_report['pr_auc']} | ROC-AUC {test_report['roc_auc']} | "
        f"P/R/F1 {test_report['at_thresholds'][0]['precision']}/"
        f"{test_report['at_thresholds'][0]['recall']}/"
        f"{test_report['at_thresholds'][0]['f1']}"
    )

    log("scoring all rows for ring construction ...")
    all_probabilities = model.predict_proba(X)[:, 1]
    first_seen_series = pd.concat(
        [
            modeled.groupby("nameOrig", observed=True)["step"].min(),
            modeled.groupby("nameDest", observed=True)["step"].min(),
        ]
    ).groupby(level=0).min()
    first_seen = {str(account): int(step) for account, step in first_seen_series.items()}

    ring_threshold = max(
        threshold_info["precision_first"]["threshold"], threshold_info["threshold"]
    )
    rings, diagnostics = build_rings(
        modeled, all_probabilities, ring_threshold, first_seen, args.max_rings
    )
    log(f"rings built: {len(rings)} at threshold {ring_threshold}")

    # Persist artifacts.
    model_path = out_dir / "detector.joblib"
    joblib.dump(
        {"model": model, "features": FEATURES, "thresholds": threshold_info}, model_path
    )
    metrics = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": {
            "path": str(csv_path),
            "rows_scanned": total_rows,
            "rows_modelled": len(modeled),
            "rows_by_type": rows_by_type,
            "frauds": int(y.sum()),
            "fraud_rate": round(float(y.mean()), 6),
            "train_rows": int(train_mask.sum()),
            "fit_rows": len(X_train),
            "fit_frauds": int(y_train.sum()),
            "fit_fraud_rate": round(float(y_train.mean()), 6),
            "negative_sample_cap": args.train_negatives,
            "validation_rows": int(val_mask.sum()),
            "test_rows": int(test_mask.sum()),
            "features": FEATURES,
        },
        "thresholds": threshold_info,
        "validation": validation_report,
        "test": test_report,
        "ring_threshold": ring_threshold,
        "rings": diagnostics,
        "runtime_seconds": round(time.time() - started, 1),
    }
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")

    payload = {
        "generated_at": metrics["generated_at"],
        "source": {
            "dataset": "PaySim (synthetic mobile-money ledger)",
            "rows_scanned": total_rows,
            "rows_modelled": len(modeled),
            "model": "HistGradientBoostingClassifier",
            "pr_auc": test_report["pr_auc"],
            "roc_auc": test_report["roc_auc"],
            "threshold": ring_threshold,
        },
        "rings": [ring.model_dump(mode="json") for ring in rings],
    }
    rings_path = ROOT / "data" / "detected_rings.json"
    rings_path.write_text(json.dumps(payload, indent=2) + "\n")

    log(f"wrote {model_path}")
    log(f"wrote {out_dir / 'metrics.json'}")
    log(f"wrote {rings_path}")
    log(f"done in {time.time() - started:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
