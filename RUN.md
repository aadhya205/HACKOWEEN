# How to run (from scratch)

## Option A — one file

Double-click **`run.bat`** (or `run.bat` from a terminal in this folder).

It creates the Python venv, installs dependencies, builds the dashboard if
needed, starts the server, and opens http://127.0.0.1:8000/.

For a **public link** you can send to a friend: `run.bat tunnel` — the
`https://….trycloudflare.com` URL appears in the second window.

Close the **Ledger API** window to stop the server. The tunnel window
closes the public link.

## Option B — manual, step by step

Prerequisites: Python 3.10+ (and Node 18+ only if you rebuild the dashboard).

```bat
:: 1. Python environment (once)
python -m venv .venv
.\.venv\Scripts\activate.bat
pip install -r requirements.txt

:: 2. Dashboard build (once, and after frontend changes)
cd frontend
npm install
npm run build
cd ..

:: 3. Run — one process serves the UI and the API
uvicorn app.main:app --port 8000
```

Open **http://127.0.0.1:8000/** (dashboard) or **/docs** (API docs).

Public link (optional, any network):

```bat
tools\cloudflared.exe tunnel --url http://127.0.0.1:8000
```

## Fresh clone, absolutely nothing installed

```bat
git clone <repo> && cd <repo>
run.bat
```

`run.bat` handles venv, pip, npm install and the dashboard build.

## Development mode (hot reload)

Two windows, useful while editing:

```bat
:: window 1
.\.venv\Scripts\activate.bat
uvicorn app.main:app --reload --port 8000

:: window 2
cd frontend
npm run dev        :: http://127.0.0.1:5173, proxies /api to :8000
```

## Tests

```bat
.\.venv\Scripts\activate.bat
pytest -q          :: expect: 46 passed
```

## LLM explanations (optional)

The chain is **Gemini -> local Ollama -> template**. Every model reply goes
through the same number guardrail; a failure falls through to the next layer.

1. Copy `.env.example` to `.env`.
2. For Gemini, paste the key into `GEMINI_API_KEY=`. `/health` reports
   `"llm": "gemini"` and the rest of the chain.
3. For the local model, install Ollama and pull one model:
   `ollama pull qwen2.5:3b-instruct`. With no key at all, `/health` reports
   `"llm": "ollama"`. Point `OLLAMA_MODEL` at the fine-tuned tag once the
   LoRA adapter is registered.

No key and no Ollama = template explanations; everything still works.

## Detector / fine-tuning pipeline

```bat
.\.venv\Scripts\activate.bat
pip install -r training\requirements-ml.txt
python training\train_detector.py      :: full 63.6 lakh-row run, ~25s
python training\build_ft_dataset.py    :: rings -> 600 guardrailed examples
python training\lora_finetune.py --dry-run
```

See [training/README.md](training/README.md) for the architecture decision
and the Ollama adapter steps.

## If something breaks

| Symptom | Fix |
| --- | --- |
| `address already in use` | A server is already running on 8000 — use it, or `taskkill /PID <pid> /F` (`netstat -ano \| findstr :8000`). |
| Dashboard shows API OFFLINE | The API window is closed/crashed — start it again; the page recovers within 10s. |
| `npm: not found` | Install Node 18+; or skip the dashboard and run the API only. |
| Public link refused | The tunnel or the API window was closed; rerun `run.bat tunnel` (URL changes). |
| `python: not found` | Reinstall Python 3.10+ and tick "Add to PATH". |
