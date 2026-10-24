import {
  Code,
  Download,
  RefreshCw,
  RotateCcw,
  Server,
  Settings as SettingsIcon,
  Sliders,
} from "lucide-react";
import { useState } from "react";
import { useInvestigation } from "../context/InvestigationContext";

export default function SettingsPage() {
  const { state, dispatch, checkAndLoadAlerts } = useInvestigation();
  const [urlInput, setUrlInput] = useState(state.apiUrl);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const start = performance.now();
    try {
      const endpoint = `${urlInput.replace(/\/+$/, "")}/alerts`;
      const res = await fetch(endpoint, { method: "GET", headers: { Accept: "application/json" } });
      const latency = Math.round(performance.now() - start);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      setTestResult({
        success: true,
        message: `Connected successfully in ${latency}ms! Received ${Array.isArray(data) ? data.length : "valid"} alerts.`,
      });
      dispatch({ type: "SET_API_URL", payload: urlInput });
      await checkAndLoadAlerts(urlInput);
    } catch (err) {
      setTestResult({
        success: false,
        message: `Connection failed: ${err.message}. Ensure your FastAPI server is running with CORS enabled.`,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleExportLogs = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.activityLog, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `forensic-investigation-log-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--space-2xl)", maxWidth: "1000px", margin: "0 auto" }}>
      {/* Page Header */}
      <div style={{ marginBottom: "var(--space-xl)" }}>
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, display: "flex", alignItems: "center", gap: "10px" }}>
          <SettingsIcon size={24} style={{ color: "var(--cyan)" }} />
          System Settings & Backend Integration
        </h1>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: "4px" }}>
          Configure live FastAPI endpoints, inspect shared data contract schemas, and manage local demo states.
        </p>
      </div>

      <div style={{ display: "grid", gap: "var(--space-xl)" }}>
        {/* SECTION 1: FASTAPI BACKEND CONFIGURATION */}
        <div
          style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-xl)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-md)" }}>
            <div>
              <h2 style={{ fontSize: "var(--text-md)", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                <Server size={18} style={{ color: "var(--cyan)" }} />
                FastAPI Backend Endpoint
              </h2>
              <p style={{ fontSize: "var(--text-xs)", color: "var(--text-dim)", marginTop: "2px" }}>
                Connects to Member 2's FastAPI detection service at <code>GET /alerts</code>.
              </p>
            </div>
            <span
              className={`status-badge ${state.dataSource === "backend" ? "open" : "resolved"}`}
              style={{ fontSize: "11px" }}
            >
              {state.dataSource === "backend" ? "CONNECTED TO API" : "USING DEMO DATA"}
            </span>
          </div>

          <div style={{ display: "flex", gap: "var(--space-sm)", marginTop: "var(--space-md)" }}>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="http://localhost:8000"
              style={{ flex: 1, padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }}
            />
            <button
              className="btn btn-primary"
              onClick={handleTest}
              disabled={testing}
              style={{ whiteSpace: "nowrap" }}
            >
              <RefreshCw size={14} className={testing ? "spin" : ""} />
              {testing ? "Testing Ping…" : "Test Ping & Load"}
            </button>
          </div>

          {testResult && (
            <div
              style={{
                marginTop: "var(--space-md)",
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                background: testResult.success ? "var(--green-glow)" : "var(--red-glow)",
                border: `1px solid ${testResult.success ? "var(--green)" : "var(--red)"}`,
                color: testResult.success ? "var(--green)" : "var(--red)",
                fontSize: "var(--text-xs)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {testResult.message}
            </div>
          )}

          <div
            style={{
              marginTop: "var(--space-lg)",
              background: "var(--bg-elevated)",
              padding: "var(--space-md)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
              fontSize: "var(--text-xs)",
              color: "var(--text-muted)",
            }}
          >
            <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
              FastAPI Run Command Guide:
            </div>
            <code>uvicorn app.main:app --reload --port 8000</code>
            <div style={{ marginTop: "6px", color: "var(--text-dim)" }}>
              Ensure your FastAPI app includes <code>CORSMiddleware</code> with <code>allow_origins=["*"]</code> so the Vite browser client can query without CORS restrictions.
            </div>
          </div>
        </div>

        {/* SECTION 2: SHARED DATA CONTRACT INSPECTOR */}
        <div
          style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-xl)",
          }}
        >
          <h2 style={{ fontSize: "var(--text-md)", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px", marginBottom: "var(--space-sm)" }}>
            <Code size={18} style={{ color: "var(--amber)" }} />
            Shared Data Contract Schema
          </h2>
          <p style={{ fontSize: "var(--text-xs)", color: "var(--text-dim)", marginBottom: "var(--space-md)" }}>
            The strict contract schema shared between the frontend and backend detection pipelines.
          </p>

          <pre
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
              padding: "var(--space-md)",
              borderRadius: "var(--radius-md)",
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              color: "var(--cyan)",
              overflowX: "auto",
              lineHeight: 1.6,
            }}
          >{`{
  "ring_id": "R1",
  "accounts": ["C123", "C456", "C789"],
  "edges": [
    { "from": "C123", "to": "C456", "amount": 9500 }
  ],
  "total_amount": 48000,
  "risk": 94,
  "explanation": "Several accounts received similar amounts and forwarded funds to a common destination."
}`}</pre>
        </div>

        {/* SECTION 3: DEMO INVESTIGATION ACTIONS & AUDIT TRAIL */}
        <div
          style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-xl)",
          }}
        >
          <h2 style={{ fontSize: "var(--text-md)", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px", marginBottom: "var(--space-sm)" }}>
            <Sliders size={18} style={{ color: "var(--green)" }} />
            Demo Forensic State Management
          </h2>
          <p style={{ fontSize: "var(--text-xs)", color: "var(--text-dim)", marginBottom: "var(--space-md)" }}>
            Actions taken during judging demos (freezes, escalations, resolutions) are safely persisted in your browser's localStorage.
          </p>

          <div style={{ display: "flex", gap: "var(--space-md)", flexWrap: "wrap" }}>
            <button
              className="btn btn-ghost"
              onClick={handleExportLogs}
              disabled={state.activityLog.length === 0}
            >
              <Download size={14} />
              Export Audit Trail ({state.activityLog.length} events)
            </button>

            <button
              className="btn btn-warning"
              onClick={() =>
                dispatch({
                  type: "SHOW_CONFIRM",
                  payload: { type: "reset", data: {} },
                })
              }
            >
              <RotateCcw size={14} />
              Reset All Demo State to Baseline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
