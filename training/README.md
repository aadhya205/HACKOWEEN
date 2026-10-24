# Local LLM + detector — architecture and runbook

## Decision: fine-tune a small open model, do not train an LLM from scratch

Training a fraud LLM from zero needs billions of tokens, a GPU cluster, and
months. What this project actually needs is a model that (a) writes the
two-sentence house explanation for an alert and (b) can run on a laptop
without sending customer data to a third party.

So the design is three specialised layers:

| Layer | What it is | Why |
| --- | --- | --- |
| Detection | HistGradientBoosting on 63.6 lakh PaySim rows | Tabular fraud is a gradient-boosting problem, not a language problem |
| Explanation | Qwen2.5-0.5B-Instruct + LoRA, served by Ollama | Small, open, tunable, local, cheap to retrain |
| Guardrail | Number check + template fallback | The model can never invent an amount, and the API never fails |

"Do your own LLM" was rejected: it would cost more, score worse, and still
need the same guardrail. A fine-tuned open model is the "own model" in the
sense that matters here — you own the weights, the adapter, the prompt, the
serving stack, and the training data, and nothing leaves the machine.

## How the 63.6 lakh rows are used

1. **Detector training** (`train_detector.py`): all 6,362,620 rows are
   scanned; the 2,770,409 TRANSFER / CASH_OUT rows (the only types that can
   be fraud in PaySim) are modelled. Split by time — 70% train, 10%
   validation for the threshold, 20% test — so the reported numbers measure
   future transactions, not memorised rows.
2. **Ring construction**: the trained model scores every row, then dense
   two-hour neighbourhoods around model-flagged accounts become candidate
   rings. They are scored with the same `app/scoring.py` maths as the API and
   written to `data/detected_rings.json`. `detection.py` only reads that
   artifact, so pandas/sklearn never enter the API process.
3. **Fine-tuning data** (`build_ft_dataset.py`): each ring is turned into the
   exact prompt the backend sends (system instruction + FACTS json) with the
   guardrailed two-sentence template as the gold answer. Amounts, timing and
   edge counts are jittered to create 60 variants per ring. Splits are by
   base ring, so validation measures unseen rings.

PaySim has transaction-level labels and no real ring labels: each fraud row
involves fresh account IDs. The ring layer is therefore a triage
neighbourhood around accounts the detector flagged, not a ground-truth
fraud-ring label. That limitation is stated in the UI copy and in the
metrics report rather than hidden.

## Measured on the real run

See `data/model/metrics.json` for the full report. Held-out test window
(latest 20% of steps, 552,504 modelled rows, 4,258 frauds):

- PR-AUC 1.0000, ROC-AUC 1.0000
- at threshold 0.30: precision 0.9995, recall 0.9998, F1 0.9996
- the bank's existing rule (`isFlaggedFraud`) catches 13 rows, recall 0.31%
- ring threshold 0.98 gives 8 disjoint rings, structural risk 54–66

Perfect scores are expected on PaySim: it is synthetic and its balance
columns leak the generator's behaviour. That is why the report publishes the
baseline, the time split, and the confusion matrix instead of claiming the
model would be perfect on production data. The next honest step is
out-of-dataset validation on a real ledger.

## Commands

```bash
# 1. train the detector and build rings (scan all 63.6 lakh rows)
pip install -r training/requirements-ml.txt
python training/train_detector.py

# 2. serve: the API now reports source="detection"
uvicorn app.main:app --port 8000

# 3. build the fine-tuning set from those rings
python training/build_ft_dataset.py

# 4. validate the set and print the training plan (no heavy deps needed)
python training/lora_finetune.py --dry-run

# 5. real LoRA run (GPU strongly recommended)
pip install -r training/requirements-finetune.txt
python training/lora_finetune.py
```

## Serving the local model with Ollama

```bash
# base model (the adapter is trained against this exact base)
ollama pull qwen2.5:3b-instruct

# convert the LoRA adapter to GGUF (llama.cpp checkout required)
python llama.cpp/convert_lora_to_gguf.py data/ft/adapter \
  --base-model-id Qwen/Qwen2.5-0.5B-Instruct --outtype f16

# register a named local model
ollama create ledger-fraud -f training/ollama.Modelfile

# point the backend at it
# .env:
#   OLLAMA_MODEL=ledger-fraud
#   OLLAMA_ENABLED=true
```

`training/ollama.Modelfile` uses `ADAPTER`, so the base weights do not need
merging. Without a local server the backend logs the failure and falls
through to the template — the dashboard never breaks.

Explanation order is `Gemini (if key) -> Ollama -> template`, and the same
number guardrail applies to both models. `GET /health` reports the chain and
`GET /model` publishes the detector report.

## Files

| File | Role |
| --- | --- |
| `training/train_detector.py` | Full PaySim scan, time split, model, metrics, rings |
| `training/build_ft_dataset.py` | Rings -> guardrailed chat JSONL (train/val) |
| `training/lora_finetune.py` | PEFT LoRA trainer + `--dry-run` validator |
| `training/README.md` | This decision record and runbook |
| `detection.py` | Serving seam: ring artifact -> API |
| `data/model/metrics.json` | Measured metrics of the committed run |
| `data/detected_rings.json` | Rings currently served by the API |
