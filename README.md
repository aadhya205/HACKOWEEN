# Ledger of the Undead — Backend (Person 2)

FastAPI service that turns detected fraud rings into **scored, explained
alerts** in the shared format from the team plan (section 5).

```
detection (Person 1)  ->  risk score + breakdown  ->  LLM explanation  ->  GET /alerts
     or fakes                   (25/25/20/15/15)   Gemini -> Ollama -> guardrail -> template
```

The ML half is documented in [training/README.md](training/README.md): a
HistGradientBoosting detector trained on all 63.6 lakh PaySim rows, ring
construction, a guardrailed fine-tuning set, and a LoRA script for a small
open model served locally by Ollama.

**Presenting or being questioned?** [BACKEND.md](BACKEND.md) is the full
dossier: every file, every dependency, the maths, the measured numbers, the
known limitations and the judge Q&A. [RUN.md](RUN.md) is the setup/troubleshooting guide.

## Run it

```bash
python -m venv .venv
source .venv/Scripts/activate        # Windows Git Bash; Linux/Mac: .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open <http://127.0.0.1:8000/docs> for the interactive Swagger page.

No API key needed to run: without `GEMINI_API_KEY` the explanation layer
uses the built-in template. To go live with Gemini, copy `.env.example`
to `.env` and fill in the key (`.env` is gitignored — never commit it).

## Frontend dashboard (black + green)

React + Vite + Cytoscape dashboard that consumes `/alerts` — graph of the
network, risk gauge, "why 94" breakdown, explanation and Freeze/Escalate.

```bash
cd frontend
npm install
npm run dev        # http://127.0.0.1:5173
```

Run the backend first (port 8000). Vite proxies `/api/*` to
`http://127.0.0.1:8000`, so the dashboard works with no CORS setup and no
config. Point it at a teammate's backend with
`VITE_API_BASE=http://192.168.x.x:8000 npm run dev`, and ship a static
build with `npm run build` (output in `frontend/dist`).

### Share one public link

FastAPI serves `frontend/dist` at `/` when it exists, so a single process
hosts the dashboard *and* the API. `npm run build` once, start uvicorn,
then open a tunnel:

```bash
./tools/cloudflared.exe tunnel --url http://127.0.0.1:8000
```

The printed `https://….trycloudflare.com` URL works from any network —
dashboard, `/alerts` and `/docs` all on one link. The URL changes each
time the tunnel restarts, and it stays up only while uvicorn and
cloudflared keep running.

## Endpoints

| Method | Path            | What it returns                                   |
| ------ | --------------- | ------------------------------------------------- |
| GET    | `/alerts`       | `{alerts[], count, source, cached, generated_at, detection_error}` |
| GET    | `/alerts/{id}`  | One alert (404 if the ring doesn't exist)         |
| GET    | `/health`       | Status, LLM chain, detector metrics, policy/calibration versions |
| GET    | `/model`        | Full detector report: dataset, time split, metrics, thresholds |
| GET    | `/policy`       | Cost matrix, implied thresholds, calibration curve |
| GET    | `/docs`         | Swagger UI                                        |

`source` is `"detection"` when Person 1's function ran, `"fake"` otherwise.
`cached: true` means every explanation came from the in-memory cache, so a
dashboard refresh never re-calls the LLM (first call ~LLM latency, later
calls milliseconds).

Example item in `alerts[]` — the shared format, plus additive extras:

```json
{
  "ring_id": "R1",
  "accounts": ["ACC7001", "MULE001", "MULE002"],
  "edges": [{"from": "ACC7001", "to": "MULE001", "amount": 8000.0}],
  "total_amount": 48000.0,
  "risk": 93,
  "explanation": "7 first-time receiver accounts ... a human analyst makes the final call.",
  "score_breakdown": [
    {"feature": "Linked accounts", "raw": 8, "normalized": 1.0,
     "weight": 25.0, "contribution": 25.0, "note": null}
  ],
  "explanation_source": "template",
  "generated_at": "2025-10-24T09:00:00Z"
}
```

The first six fields are the contract from section 5 — **do not rename or
remove them without telling the group**. Everything after `explanation` is
additive; the frontend can ignore it.

## Person 1: plugging in your detection

The API calls `<DETECTION_MODULE>.<DETECTION_FUNCTION>()` — by default
`detection.find_rings()` in `detection.py` at the repo root:

```python
# detection.py  (repo root)
def find_rings() -> list[dict]:
    """Load your PaySim slice, build the graph, return the rings found."""
    return [
        {
            "ring_id": "R1",
            "accounts": ["ACC7001", "MULE001", ...],
            "edges": [
                {"from": "ACC7001", "to": "MULE001", "amount": 8000.0,
                 "timestamp": "2025-10-24T09:00:00Z"}   # timestamp optional
            ],
            "total_amount": 48000.0,           # optional: summed from edges if absent
            "time_window_seconds": 110.0,       # optional: derived from timestamps if absent
            "new_accounts": 7,                  # optional: first-time receivers
            "anomaly_score": 0.91,              # optional: Isolation Forest score 0-1
            "pattern": "fan-out then merge",    # optional: shown to the LLM
        }
    ]
```

* Take **no arguments** (load your data inside). A single optional
  argument like `find_rings(transactions=None)` also works.
* Keys are tolerant: `from`/`source`/`sender` and `to`/`target`/`receiver`
  are all accepted. Extra keys are ignored.
* Different name? Set `DETECTION_MODULE` / `DETECTION_FUNCTION` in `.env`.
* Until the module exists, `/alerts` serves built-in fakes (R1 planted
  ring, R2 circular flow).
* If your function **raises**, the API serves the fakes and reports why in
  `detection_error` — the demo never hard-breaks, but the error is visible.
* If it returns `[]`, you get `[]` honestly — unless you set
  `FALLBACK_TO_FAKE_WHEN_EMPTY=true` to protect the live demo.

## Person 3: consuming `/alerts`

```js
const res  = await fetch("http://127.0.0.1:8000/alerts");
const data = await res.json();     // -> { alerts: [...], count, source, ... }
setAlerts(data.alerts);            // each alert is the shared format
```

CORS is open by default (`CORS_ORIGINS=*`); restrict it to your dev
origin in `.env` if you prefer. Extra per-alert fields you can use:
`score_breakdown` for the "why 94" panel, `explanation_source` to badge
AI vs template text.

## Person 4: replacing the fake alerts

Write `data/fake_alerts.json` — either a list of alert objects or
`{"alerts": [...]}` in the shared format (missing fields get sensible
defaults). It is loaded in preference to the built-ins and can be
committed (only `data/*.csv` is gitignored).

## Risk score — the explainability story

Every feature is normalised to 0–1, multiplied by its weight and summed
(see [app/scoring.py](app/scoring.py) for the constants):

| Feature                  | Weight | Normalised by                                  |
| ------------------------ | ------ | ---------------------------------------------- |
| Linked accounts          | 25     | `min(accounts / 6, 1)`                         |
| Time window              | 25     | `1 − min(window, 600s) / 600s` (shorter = worse) |
| Amount similarity        | 20     | `1 − (stddev / mean)` of edge amounts          |
| Total amount moved       | 15     | `min(total / 50,000, 1)`                       |
| Account newness          | 15     | `new_accounts / ring accounts`                 |
| Anomaly score (optional) | 10     | Isolation Forest score, if Person 1 supplies it |

When the anomaly score is present the first five weights scale down to
sum to 90, so the breakdown always adds up to exactly 100 and the
returned `score_breakdown` rows add up to `risk`. Missing fields fall
back to documented assumptions (window 180s, newness 0.5) and each row
says so in its `note`.

## LLM explanation — Gemini -> local Ollama -> guardrail -> template

1. **Gemini free tier** (`gemini-2.5-flash` by default), when a key is set:
   only the ring's facts JSON is sent, asked for exactly two sentences,
   bounded by `LLM_TIMEOUT_SECONDS` (3.5s).
2. **Local Ollama** (`qwen2.5:3b-instruct` by default): no key, no data
   leaving the machine. This is where a fine-tuned LoRA adapter plugs in.
   Bounded by `OLLAMA_TIMEOUT_SECONDS` (8s). If no server is running the
   failure is logged and the next layer runs.
3. **Number guardrail**: every number in the reply must appear in the facts
   payload we sent — otherwise the reply is discarded, whichever model wrote
   it. No model can invent an amount.
4. **Template**: a fill-in-the-blank two-sentence explanation built from the
   same facts. Always available, so the endpoint never fails.

`explanation_source` on each alert says which layer produced the text
(`gemini`, `ollama` or `template`). `GET /health` publishes the chain.

```bash
ollama pull qwen2.5:3b-instruct        # once
ollama serve                           # if not already running
```

## Decision layer — probability and expected loss

`risk` is a ranking signal; 93 does not mean "93% fraud". `app/calibration.py`
fits a logistic (Platt) curve from score to **P(fraud)** over the labelled set
in `app/labelled.py` (laundering shapes plus legitimate look-alikes: payroll,
merchant settlements, rent, loan disbursement, gig payroll). `app/policy.py`
then prices three actions by expected loss and recommends the cheapest:

| Action | Loss if fraud | Loss if legitimate |
| ------ | ------------: | -----------------: |
| freeze | 0.10 | 0.60 |
| escalate | 0.50 | 0.05 |
| watch | 1.00 | 0.00 |

Every alert now carries `probability` and `decision`
(`recommended_action`, `expected_loss`, `policy_version`, `rationale`), and
`GET /policy` publishes the matrix and the curve — thresholds fall out of the
matrix (0.09 to review, 0.58 to freeze) instead of being hard-coded. Both
versions are in `/health` and in the cache key, so old maths is never served
from cache under new maths.

Current demo: **R1 → P(fraud) 0.91 → freeze**, **R2 → P(fraud) 0.23 →
escalate**. Losses are normalised to one unit of exposure; scaling by amount is
the documented next step.

## Tests

```bash
pytest -q
```

46 tests cover the score's math, the planted-ring-vs-payroll-decoy
separation, the guardrail (rejects invented numbers, accepts comma
formatting), template fallback on timeout, the two-sentence limit, the
shared-format contract (including the `from`/`to` edge aliases), cache
behaviour, CORS, the calibration curve (monotone, bounded, fitted) and the
decision policy (cheapest action, ordered thresholds, `/policy`, cache key).
Tests force keyless mode and never hit the network.
