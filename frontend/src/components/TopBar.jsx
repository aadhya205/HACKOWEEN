import {
  Bell,
  RefreshCw,
  Search,
  Server,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useInvestigation } from "../context/InvestigationContext";

function formatTime() {
  const now = new Date();
  return now.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function TopBar() {
  const { state, dispatch, checkAndLoadAlerts } = useInvestigation();
  const [time, setTime] = useState(formatTime);
  const [customApiUrl, setCustomApiUrl] = useState(state.apiUrl);
  const [isTesting, setIsTesting] = useState(false);
  const notifRef = useRef(null);
  const backendRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(() => setTime(formatTime()), 1000);
    return () => clearInterval(interval);
  }, []);

  const isBackendConnected = state.dataSource === "backend";

  const handleTestBackend = async () => {
    setIsTesting(true);
    dispatch({ type: "SET_API_URL", payload: customApiUrl });
    await checkAndLoadAlerts(customApiUrl);
    setIsTesting(false);
  };

  return (
    <header className="topbar" role="banner">
      {/* Left Segment: Environment & Backend Status Indicator */}
      <div className="topbar-left">
        <span className="topbar-env">DEMO ENVIRONMENT</span>

        <button
          className="topbar-connection"
          onClick={() => dispatch({ type: "TOGGLE_BACKEND_MODAL" })}
          title="Click to view backend connection settings & ping FastAPI"
          style={{ cursor: "pointer", background: "none", border: "none", padding: "4px 8px", borderRadius: "4px" }}
        >
          <span
            className={`conn-dot ${isBackendConnected ? "connected" : "disconnected"}`}
          />
          <span style={{ fontSize: "var(--text-xs)", color: isBackendConnected ? "var(--green)" : "var(--amber)" }}>
            {isBackendConnected ? "API Connected (Live)" : "Simulated Engine (Local)"}
          </span>
        </button>
      </div>

      {/* Center Segment: Forensic Search */}
      <div className="topbar-search">
        <Search size={14} aria-hidden="true" style={{ color: "var(--text-dim)" }} />
        <input
          type="text"
          placeholder="Search account ID (e.g. C1001, N001) or ring ID (RING-001)…"
          value={state.searchQuery}
          onChange={(e) => dispatch({ type: "SET_SEARCH", payload: e.target.value })}
          aria-label="Search accounts or rings"
        />
        {state.searchQuery && (
          <button
            onClick={() => dispatch({ type: "SET_SEARCH", payload: "" })}
            style={{ color: "var(--text-dim)", padding: "2px" }}
            title="Clear search"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Right Segment: Notifications & Clock */}
      <div className="topbar-right" style={{ position: "relative" }}>
        <button
          className="topbar-btn"
          aria-label="Toggle notifications drawer"
          onClick={() => dispatch({ type: "TOGGLE_NOTIFICATIONS" })}
          title="Investigation notifications"
        >
          <Bell size={16} />
          {state.activityLog.length > 0 && <span className="notification-dot" />}
        </button>

        <span className="topbar-time" title="Current Local Time">
          {time}
        </span>
      </div>

      {/* Backend Connection Popover Modal */}
      {state.showBackendModal && (
        <div
          className="dialog-overlay"
          onClick={() => dispatch({ type: "CLOSE_BACKEND_MODAL" })}
          style={{ zIndex: 1000 }}
        >
          <div
            className="dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "460px" }}
            ref={backendRef}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
                <Server size={18} style={{ color: "var(--cyan)" }} />
                Backend Connection Setup
              </h3>
              <button
                className="graph-toolbar-btn"
                onClick={() => dispatch({ type: "CLOSE_BACKEND_MODAL" })}
              >
                <X size={14} />
              </button>
            </div>

            <div className="demo-notice" style={{ marginTop: "12px" }}>
              Endpoint target: <code>GET /alerts</code>. Follows shared data contract.
            </div>

            <p style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginTop: "8px" }}>
              Connect this forensic interface to your team's FastAPI server. If unreachable, clearly labeled simulated data remains available for judging.
            </p>

            <div style={{ marginTop: "16px", display: "grid", gap: "8px" }}>
              <label style={{ fontSize: "var(--text-xs)", color: "var(--text-dim)", fontWeight: 600 }}>
                Vite API Base URL (VITE_API_BASE_URL)
              </label>
              <input
                type="text"
                value={customApiUrl}
                onChange={(e) => setCustomApiUrl(e.target.value)}
                placeholder="http://localhost:8000"
                style={{ width: "100%", padding: "8px 12px", fontFamily: "var(--font-mono)" }}
              />
            </div>

            <div
              style={{
                marginTop: "12px",
                padding: "10px",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                fontSize: "var(--text-xs)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className={`conn-dot ${isBackendConnected ? "connected" : "disconnected"}`} />
                <span>Status: <strong>{isBackendConnected ? "ONLINE (Connected)" : "OFFLINE (Using Demo Data)"}</strong></span>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                {state.alerts.length} rings loaded
              </span>
            </div>

            <div className="dialog-actions" style={{ marginTop: "20px" }}>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  dispatch({ type: "SET_ALERTS", payload: { alerts: state.alerts, source: "demo" } });
                  dispatch({ type: "CLOSE_BACKEND_MODAL" });
                }}
              >
                Use Local Demo Data
              </button>
              <button
                className="btn btn-primary"
                onClick={handleTestBackend}
                disabled={isTesting}
              >
                <RefreshCw size={13} className={isTesting ? "spin" : ""} />
                {isTesting ? "Testing Ping…" : "Test Ping /alerts"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications Drawer Popover */}
      {state.showNotificationDrawer && (
        <div
          ref={notifRef}
          style={{
            position: "absolute",
            top: "var(--topbar-height)",
            right: "12px",
            width: "360px",
            maxHeight: "440px",
            background: "var(--bg-panel)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 999,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            animation: "fadeIn 0.2s ease",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Bell size={14} style={{ color: "var(--cyan)" }} />
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>Investigation Events</span>
              <span className="badge" style={{ fontSize: "10px", padding: "1px 6px" }}>
                {state.activityLog.length}
              </span>
            </div>
            <div style={{ display: "flex", gap: "4px" }}>
              {state.activityLog.length > 0 && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => dispatch({ type: "CLEAR_ACTIVITY_LOG" })}
                  title="Clear log"
                  style={{ padding: "4px" }}
                >
                  <Trash2 size={12} />
                </button>
              )}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => dispatch({ type: "CLOSE_NOTIFICATIONS" })}
                style={{ padding: "4px" }}
              >
                <X size={12} />
              </button>
            </div>
          </div>

          <div style={{ overflowY: "auto", flex: 1, padding: "8px 12px" }}>
            {state.activityLog.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-dim)", fontSize: "var(--text-xs)" }}>
                No active notifications or investigation events yet.
              </div>
            ) : (
              state.activityLog.map((log) => (
                <div
                  key={log.id}
                  style={{
                    padding: "8px 10px",
                    borderBottom: "1px solid var(--border-subtle)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "3px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: "9px",
                        fontFamily: "var(--font-mono)",
                        textTransform: "uppercase",
                        padding: "1px 4px",
                        borderRadius: "2px",
                        background:
                          log.type === "freeze"
                            ? "var(--amber-glow)"
                            : log.type === "escalate"
                            ? "var(--red-glow)"
                            : "var(--cyan-glow)",
                        color:
                          log.type === "freeze"
                            ? "var(--amber)"
                            : log.type === "escalate"
                            ? "var(--red)"
                            : "var(--cyan)",
                      }}
                    >
                      {log.type}
                    </span>
                    <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  </div>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-primary)" }}>
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </header>
  );
}
