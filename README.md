# 💀 Ledger of the Undead — Fraud Ring Intelligence

> **Detect. Score. Explain. Decide.**
>
> A full-stack fraud detection system that spots money-laundering rings in
> transaction networks, scores them with an explainable weighted model,
> explains each alert in plain English via an LLM chain, and recommends
> cost-optimal actions through a calibrated decision layer.

---

## 🚀 Live Demo

**The app is deployed and running on Vercel — try it now:**

| | Link | What you'll see |
|---|---|---|
| 🖥️ **Dashboard** | **[ledger-of-the-undead.vercel.app](https://ledger-of-the-undead.vercel.app)** | Interactive fraud ring visualisation with network graph, risk gauge, score breakdown, and action recommendations |
| 📡 **API Explorer** | [/docs](https://ledger-of-the-undead.vercel.app/docs) | Interactive Swagger UI — test every endpoint live |
| ❤️ **Health Check** | [/health](https://ledger-of-the-undead.vercel.app/health) | System status, LLM chain, detector metrics |
| 📊 **Policy Matrix** | [/policy](https://ledger-of-the-undead.vercel.app/policy) | The decision cost matrix and calibration curve |
| 🔬 **Model Report** | [/model](https://ledger-of-the-undead.vercel.app/model) | Full detector metrics: dataset, precision, recall, thresholds |

### 🎯 Try the API right now

```bash
# Fetch all fraud ring alerts (live!)
curl https://ledger-of-the-undead.vercel.app/alerts

# Get a single alert by ring ID
curl https://ledger-of-the-undead.vercel.app/alerts/R1

# Check system health and LLM chain status
curl https://ledger-of-the-undead.vercel.app/health

# View the decision policy and calibration curve
curl https://ledger-of-the-undead.vercel.app/policy
```

Or just paste any of these URLs into your browser — the API returns JSON you can inspect directly.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         LIVE ON VERCEL                              │
│  ledger-of-the-undead.vercel.app                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌──────────────────────────────────────────┐   │
│  │   Frontend    │    │              FastAPI Backend             │   │
│  │  React + Vite │    │                                          │   │
│  │  Cytoscape.js │◄──►│  /alerts ─► Detection ─► Scoring ─►     │   │
│  │              │    │               LLM Explanation ─►          │   │
│  │  • Network   │    │               Calibration ─►              │   │
│  │    graph     │    │               Decision Policy             │   │
│  │  • Risk gauge│    │                                          │   │
│  │  • Breakdown │    │  /health  /model  /policy  /docs         │   │
│  │  • Actions   │    │                                          │   │
│  └──────────────┘    └──────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

```
Detection (Person 1)  ─►  Risk Score + Breakdown  ─►  LLM Explanation  ─►  GET /alerts
     or fakes                 (25/25/20/15/15)      Gemini → Ollama → guardrail → template
```

The ML half is documented in [training/README.md](training/README.md): a
HistGradientBoosting detector trained on all 63.6 lakh PaySim rows, ring
construction, a guardrailed fine-tuning set, and a LoRA script for a small
open model served locally by Ollama.

---

## 📋 Endpoints

All endpoints are **live** — click any link to try it:

| Method | Path | Live link | Returns |
|--------|------|-----------|---------|
| GET | `/alerts` | [**Try it →**](https://ledger-of-the-undead.vercel.app/alerts) | `{alerts[], count, source, cached, generated_at, detection_error}` |
| GET | `/alerts/{id}` | [**Try it →**](https://ledger-of-the-undead.vercel.app/alerts/R1) | One alert (404 if the ring doesn't exist) |
| GET | `/health` | [**Try it →**](https://ledger-of-the-undead.vercel.app/health) | Status, LLM chain, detector metrics, policy/calibration versions |
| GET | `/model` | [**Try it →**](https://ledger-of-the-undead.vercel.app/model) | Full detector report: dataset, time split, metrics, thresholds |
| GET | `/policy` | [**Try it →**](https://ledger-of-the-undead.vercel.app/policy) | Cost matrix, implied thresholds, calibration curve |
| GET | `/docs` | [**Try it →**](https://ledger-of-the-undead.vercel.app/docs) | Interactive Swagger UI |

### Example alert response

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
  "probability": 0.91,
  "decision": {
    "recommended_action": "freeze",
    "expected_loss": {"freeze": 0.15, "escalate": 0.46, "watch": 0.91},
    "rationale": "At P(fraud)=0.91, freezing costs 0.15 — less than ..."
  }
}
```

The first six fields (`ring_id`, `accounts`, `edges`, `total_amount`, `risk`, `explanation`)
are the shared contract — **do not rename or remove them without telling the group**.
Everything after is additive; the frontend can ignore it.

---

## 🧠 Risk Score — the explainability story

Every feature is normalised to 0–1, multiplied by its weight and summed
(see [app/scoring.py](app/scoring.py) for the constants):

| Feature | Weight | Normalised by |
|---|:---:|---|
| 🔗 Linked accounts | 25 | `min(accounts / 6, 1)` |
| ⏱️ Time window | 25 | `1 − min(window, 600s) / 600s` (shorter = worse) |
| 💰 Amount similarity | 20 | `1 − (stddev / mean)` of edge amounts |
| 📈 Total amount moved | 15 | `min(total / 50,000, 1)` |
| 🆕 Account newness | 15 | `new_accounts / ring accounts` |
| 🔍 Anomaly score *(optional)* | 10 | Isolation Forest score, if Person 1 supplies it |

When the anomaly score is present the first five weights scale down to
sum to 90, so the breakdown always adds up to exactly **100** and the
returned `score_breakdown` rows add up to `risk`. Missing fields fall
back to documented assumptions (window 180s, newness 0.5) and each row
says so in its `note`.

---

## 🤖 LLM Explanation Chain

```
Gemini (free tier)  ──►  Local Ollama  ──►  Number Guardrail  ──►  Template
       │                      │                    │                    │
  needs API key         no key needed        discards replies      always works
  3.5s timeout          8s timeout         with invented nums      never fails
```

1. **Gemini free tier** (`gemini-2.5-flash`): only the ring's facts JSON, asked for exactly two sentences, bounded by timeout.
2. **Local Ollama** (`qwen2.5:3b-instruct`): no key, no data leaving the machine. This is where a fine-tuned LoRA adapter plugs in.
3. **Number guardrail**: every number in the reply must appear in the facts payload — otherwise the reply is discarded. No model can invent an amount.
4. **Template**: a fill-in-the-blank explanation built from the same facts. Always available, so **the endpoint never fails**.

`explanation_source` on each alert says which layer produced the text. [**Check it live →**](https://ledger-of-the-undead.vercel.app/health)

---

## ⚖️ Decision Layer — probability and expected loss

`risk` is a ranking signal; 93 does not mean "93% fraud". The calibration layer
fits a logistic (Platt) curve from score to **P(fraud)**, then the policy layer
prices three actions by expected loss and recommends the cheapest:

| Action | Loss if fraud | Loss if legitimate |
|--------|:---:|:---:|
| 🔒 freeze | 0.10 | 0.60 |
| 📋 escalate | 0.50 | 0.05 |
| 👁️ watch | 1.00 | 0.00 |

Current demo results: **R1 → P(fraud) 0.91 → freeze** · **R2 → P(fraud) 0.23 → escalate**

[**See the full policy and calibration curve →**](https://ledger-of-the-undead.vercel.app/policy)

---

## 🖥️ Run Locally

### Option A — one click

Double-click **`run.bat`** — it creates the venv, installs deps, builds the
dashboard, starts the server, and opens http://127.0.0.1:8000/.

### Option B — step by step

```bash
# 1. Backend
python -m venv .venv
source .venv/Scripts/activate        # Windows Git Bash; Linux/Mac: .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 2. Frontend (separate terminal)
cd frontend
npm install
npm run dev                          # http://127.0.0.1:5173
```

### Option C — use the live deployment

No install needed — everything is at **[ledger-of-the-undead.vercel.app](https://ledger-of-the-undead.vercel.app)**.

---

## 🔌 Integration Guide

### Person 1: plugging in detection

The API calls `detection.find_rings()` in `detection.py` at the repo root:

```python
def find_rings() -> list[dict]:
    return [{
        "ring_id": "R1",
        "accounts": ["ACC7001", "MULE001", ...],
        "edges": [{"from": "ACC7001", "to": "MULE001", "amount": 8000.0}],
        "total_amount": 48000.0,           # optional
        "time_window_seconds": 110.0,       # optional
        "new_accounts": 7,                  # optional
        "anomaly_score": 0.91,              # optional
        "pattern": "fan-out then merge",    # optional
    }]
```

- Takes **no arguments** (load your data inside)
- Keys are tolerant: `from`/`source`/`sender` and `to`/`target`/`receiver` all accepted
- Until the module exists, `/alerts` serves built-in fakes
- If it **raises**, fakes are served and `detection_error` explains why

### Person 3: consuming `/alerts`

```js
// Works with the live deployment too!
const res  = await fetch("https://ledger-of-the-undead.vercel.app/alerts");
const data = await res.json();     // -> { alerts: [...], count, source, ... }
setAlerts(data.alerts);            // each alert is the shared format
```

CORS is open by default. Extra per-alert fields you can use:
`score_breakdown` for the "why 94" panel, `explanation_source` to badge AI vs template text.

### Person 4: replacing the fake alerts

Write `data/fake_alerts.json` — either a list of alert objects or `{"alerts": [...]}` in
the shared format. Loaded in preference to the built-ins.

---

## 🧪 Tests

```bash
pytest -q          # expect: 46 passed
```

46 tests cover: score math · planted-ring-vs-payroll-decoy separation ·
guardrail (rejects invented numbers, accepts comma formatting) · template
fallback on timeout · two-sentence limit · shared-format contract ·
cache behaviour · CORS · calibration curve (monotone, bounded, fitted) ·
decision policy (cheapest action, ordered thresholds, `/policy`, cache key).
Tests force keyless mode and never hit the network.

---

## 🚢 Deployment

Deployed on **Vercel** as a serverless Python function + static React build.

```bash
# Redeploy after changes
npx vercel --prod
```

The `vercel.json` routes API paths (`/alerts`, `/health`, `/model`, `/policy`, `/docs`)
to the Python serverless function, and serves the React dashboard from `frontend/dist`
for everything else.

---

## 📚 Further Reading

- **[BACKEND.md](BACKEND.md)** — Full dossier: every file, dependency, maths, measured numbers, known limitations, judge Q&A
- **[RUN.md](RUN.md)** — Setup & troubleshooting guide
- **[training/README.md](training/README.md)** — ML pipeline: detector, ring construction, fine-tuning dataset, LoRA script
