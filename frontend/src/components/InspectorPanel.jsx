import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  FileWarning,
  Layers,
  Network,
  Play,
  RotateCcw,
  Scale,
  Shield,
  Snowflake,
  Square,
  User,
  X,
} from "lucide-react";
import { useState } from "react";
import { useInvestigation } from "../context/InvestigationContext";
import { accountMetadata, normalAccountMetadata } from "../data/demoAlerts";
import { actionSeverity } from "../lib/format";
import BreakdownBars from "./BreakdownBars";
import RiskGauge from "./RiskGauge";

export default function InspectorPanel() {
  const {
    state,
    dispatch,
    getSelectedRing,
    getRingStatus,
    getRingCase,
    getSeverity,
    isAccountFrozen,
  } = useInvestigation();
  const [whyExpanded, setWhyExpanded] = useState(true);
  const [copiedId, setCopiedId] = useState(false);
  const [activeTab, setActiveTab] = useState("ring"); // "ring" | "account"

  const ring = getSelectedRing();
  const allMeta = { ...normalAccountMetadata, ...accountMetadata };
  const selectedAccountMeta = state.selectedAccountId ? allMeta[state.selectedAccountId] : null;

  const handleCopyId = (text) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(true);
    dispatch({
      type: "ADD_TOAST",
      payload: { type: "info", message: `Copied ${text} to clipboard` },
    });
    setTimeout(() => setCopiedId(false), 2000);
  };

  // If nothing is selected at all
  if (!ring && !state.selectedAccountId) {
    return (
      <aside
        className="inspector-panel is-empty"
        role="complementary"
        aria-label="Investigation inspector"
      >
        <div className="inspector-header">
          <h2>
            <Shield size={16} />
            Forensic Inspector
          </h2>
        </div>
        <div className="inspector-empty">
          <Network size={44} style={{ color: "var(--cyan-dim)", opacity: 0.6 }} />
          <h3 style={{ fontSize: "var(--text-md)", fontWeight: 600, color: "var(--text-secondary)", marginTop: "12px" }}>
            Awaiting Target Selection
          </h3>
          <p style={{ fontSize: "var(--text-xs)", color: "var(--text-dim)", lineHeight: 1.6, maxWidth: "260px" }}>
            Click any account node on the transaction graph or select an active fraud ring to view real-time forensic telemetry, risk breakdown, and trace paths.
          </p>
          <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px", width: "100%", maxWidth: "240px" }}>
            <span style={{ fontSize: "10px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Quick Target Presets:
            </span>
            {state.alerts.map((a) => (
              <button
                key={a.ring_id}
                className="btn btn-ghost btn-sm"
                style={{ justifyContent: "space-between", textAlign: "left", fontSize: "11px" }}
                onClick={() => dispatch({ type: "SELECT_RING", payload: a.ring_id })}
              >
                <span>{a.ring_id}</span>
                <span style={{ color: a.risk >= 90 ? "var(--red)" : "var(--amber)", fontFamily: "var(--font-mono)" }}>
                  Risk {a.risk}
                </span>
              </button>
            ))}
          </div>
        </div>
      </aside>
    );
  }

  // Account details if inspecting an individual account
  const isSelectedFrozen = state.selectedAccountId ? isAccountFrozen(state.selectedAccountId) : false;
  const status = ring ? getRingStatus(ring.ring_id) : "Normal";
  const caseData = ring ? getRingCase(ring.ring_id) : null;
  const severity = ring ? getSeverity(ring.risk) : "low";

  // Derive pattern explainability based strictly on data
  const patterns = [];
  if (ring) {
    const targetCounts = {};
    ring.edges.forEach((e) => {
      targetCounts[e.to] = (targetCounts[e.to] || 0) + 1;
    });
    const commonDest = Object.entries(targetCounts).find(([, c]) => c >= 3);
    if (commonDest) {
      patterns.push({
        title: "Fan-In Funneling to Destination",
        detail: `Multiple independent source accounts forwarding 100% of funds to sink node ${commonDest[0]} (${commonDest[1]} incoming transfers).`,
        badge: "STRUCTURAL",
      });
    }

    const amounts = ring.edges.map((e) => e.amount);
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / (amounts.length || 1);
    const allSimilar = amounts.every((a) => Math.abs(a - avgAmount) / avgAmount < 0.15);
    if (allSimilar) {
      patterns.push({
        title: "Uniform Amount Calibration",
        detail: `Transfers tightly clustered near $${Math.round(avgAmount).toLocaleString()}, consistent with evasion of CTR thresholds.`,
        badge: "STATISTICAL",
      });
    }

    const sourceSet = new Set(ring.edges.map((e) => e.from));
    const targetSet = new Set(ring.edges.map((e) => e.to));
    const intermediaries = [...sourceSet].filter((s) => targetSet.has(s));
    if (intermediaries.length >= 3) {
      patterns.push({
        title: "Multi-Hop Layering Chain",
        detail: `Rapid sequential pass-through across ${intermediaries.length} intermediary accounts with negligible dwell time.`,
        badge: "VELOCITY",
      });
    }

    const possibleEdges = ring.accounts.length * (ring.accounts.length - 1);
    const density = possibleEdges > 0 ? ring.edges.length / possibleEdges : 0;
    if (density > 0.4) {
      patterns.push({
        title: "Dense Closed-Loop Turnover",
        detail: `Inter-account connectivity density of ${Math.round(density * 100)}%, indicating synthetic wash trading and circular flow.`,
        badge: "TOPOLOGY",
      });
    }
  }

  return (
    <aside className="inspector-panel" role="complementary" aria-label="Investigation inspector">
      {/* Panel Header */}
      <div className="inspector-header">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Shield size={16} style={{ color: "var(--cyan)" }} />
          <h2>Forensic Inspector</h2>
        </div>
        <button
          className="graph-toolbar-btn"
          onClick={() => dispatch({ type: "DESELECT_ALL" })}
          title="Close Inspector"
          aria-label="Close inspector"
        >
          <X size={14} />
        </button>
      </div>

      {/* Tabs if both Ring and Account are active */}
      {ring && state.selectedAccountId && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            background: "var(--bg-deep)",
            borderBottom: "1px solid var(--border-subtle)",
            padding: "4px 8px",
            gap: "4px",
          }}
        >
          <button
            className={`btn btn-sm ${activeTab === "ring" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setActiveTab("ring")}
            style={{ fontSize: "11px", padding: "4px 8px" }}
          >
            <Layers size={12} /> Ring {ring.ring_id}
          </button>
          <button
            className={`btn btn-sm ${activeTab === "account" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setActiveTab("account")}
            style={{ fontSize: "11px", padding: "4px 8px" }}
          >
            <User size={12} /> Account {state.selectedAccountId}
          </button>
        </div>
      )}

      <div className="inspector-body">
        {/* VIEW 1: SELECTED ACCOUNT PROFILE (if clicked or activeTab === 'account') */}
        {(!ring || activeTab === "account") && state.selectedAccountId && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span className="ring-id-badge" style={{ color: "var(--cyan)", borderColor: "var(--cyan-glow)" }}>
                  {state.selectedAccountId}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleCopyId(state.selectedAccountId)}
                  title="Copy Account ID"
                  style={{ padding: "2px 4px" }}
                >
                  {copiedId ? <Check size={12} color="var(--green)" /> : <Copy size={12} />}
                </button>
              </div>
              {isSelectedFrozen ? (
                <span className="frozen-tag">FREEZE REQUESTED (DEMO)</span>
              ) : (
                <span className="status-badge open">ACTIVE</span>
              )}
            </div>

            {/* Account Metadata Card */}
            <div
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-md)",
                display: "grid",
                gap: "var(--space-sm)",
                fontSize: "var(--text-xs)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-dim)" }}>Entity Name:</span>
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {selectedAccountMeta?.name || "Corporate Entity"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-dim)" }}>Account Type:</span>
                <span style={{ color: "var(--text-secondary)" }}>{selectedAccountMeta?.type || "Standard Checking"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-dim)" }}>Jurisdiction / Region:</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--cyan)" }}>
                  {selectedAccountMeta?.region || "Offshore"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-dim)" }}>Registration Date:</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                  {selectedAccountMeta?.opened || "2025-01-15"}
                </span>
              </div>
            </div>

            {/* Quick Action: Freeze / Unfreeze */}
            <div style={{ display: "flex", gap: "8px" }}>
              {isSelectedFrozen ? (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ flex: 1, borderColor: "var(--amber)" }}
                  onClick={() =>
                    dispatch({ type: "UNFREEZE_ACCOUNT", payload: state.selectedAccountId })
                  }
                >
                  <RotateCcw size={12} /> Lift Freeze (Demo)
                </button>
              ) : (
                <button
                  className="btn btn-warning btn-sm"
                  style={{ flex: 1 }}
                  onClick={() =>
                    dispatch({
                      type: "SHOW_CONFIRM",
                      payload: { type: "freeze", data: { accountId: state.selectedAccountId } },
                    })
                  }
                >
                  <Snowflake size={12} /> Freeze Account (Demo)
                </button>
              )}
              {ring && activeTab === "account" && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setActiveTab("ring")}
                >
                  View Ring
                </button>
              )}
            </div>

            <div className="demo-notice">
              ⚠ FORENSIC ACTION NOTE: Account freeze actions are safely sandboxed in simulation mode.
            </div>
          </div>
        )}

        {/* VIEW 2: RING INVESTIGATION DOSSIER */}
        {ring && (!state.selectedAccountId || activeTab === "ring") && (
          <>
            {/* Ring Header & Case Status */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span className="ring-id-badge">{ring.ring_id}</span>
              <span className={`status-badge ${status.toLowerCase()}`}>{status}</span>
              {ring.decision && (
                <span
                  className={`severity-badge ${actionSeverity(ring.decision.recommended_action)}`}
                  title={ring.decision.rationale}
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  REC: {ring.decision.recommended_action.toUpperCase()}
                </span>
              )}
              {ring.probability != null && ring.probability > 0 && (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    background: "var(--cyan-glow)",
                    border: "1px solid var(--cyan-dim)",
                    color: "var(--cyan)",
                  }}
                  title="Calibrated probability that this ring is genuinely fraudulent (Platt-scaled)"
                >
                  P(FRAUD) {(ring.probability * 100).toFixed(1)}%
                </span>
              )}
              {caseData && (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    background: "var(--red-glow)",
                    border: "1px solid var(--red-dim)",
                    color: "var(--red)",
                  }}
                >
                  {caseData.caseId}
                </span>
              )}
              <span
                className="demo-badge"
                style={{
                  marginLeft: "auto",
                  ...(state.dataSource === "backend"
                    ? { color: "var(--green)", background: "var(--green-glow)" }
                    : {}),
                }}
              >
                {state.dataSource === "backend" ? "LIVE API" : "DEMO DATA"}
              </span>
            </div>

            {/* Risk Gauge */}
            <RiskGauge risk={ring.risk} />

            {/* Core Metrics */}
            <div className="ring-meta">
              <div className="ring-meta-item">
                <span className="meta-label">Total Flagged</span>
                <span className="meta-value danger">${ring.total_amount.toLocaleString()}</span>
              </div>
              <div className="ring-meta-item">
                <span className="meta-label">Accounts</span>
                <span className="meta-value">{ring.accounts.length}</span>
              </div>
              <div className="ring-meta-item">
                <span className="meta-label">Transfers</span>
                <span className="meta-value">{ring.edges.length}</span>
              </div>
              <div className="ring-meta-item">
                <span className="meta-label">Severity</span>
                <span className={`severity-badge ${severity}`} style={{ width: "fit-content" }}>
                  {severity.toUpperCase()}
                </span>
              </div>
            </div>

            {/* AI Investigation Brief */}
            <div className="inspector-section">
              <div className="inspector-section-title">
                <FileWarning size={13} style={{ color: "var(--amber)" }} />
                AI Investigation Brief
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: "10px",
                    fontFamily: "var(--font-mono)",
                    padding: "1px 6px",
                    borderRadius: "4px",
                    background: ["gemini", "ollama"].includes(ring.explanation_source)
                      ? "var(--cyan-glow)"
                      : "var(--bg-elevated)",
                    border: `1px solid ${
                      ["gemini", "ollama"].includes(ring.explanation_source)
                        ? "var(--cyan)"
                        : "var(--border-default)"
                    }`,
                    color: ["gemini", "ollama"].includes(ring.explanation_source)
                      ? "var(--cyan)"
                      : "var(--text-dim)",
                  }}
                >
                  {ring.explanation_source === "gemini"
                    ? "GEMINI AI"
                    : ring.explanation_source === "ollama"
                      ? "LOCAL LLM"
                      : "TEMPLATE"}
                </span>
              </div>
              <div className="explanation-box">
                <div className="explanation-label">
                  <span>{ring.isSimulated ? "FORENSIC SUMMARY (SIMULATED)" : "BACKEND DETECTION SUMMARY"}</span>
                </div>
                {ring.explanation}
              </div>
            </div>

            {/* Backend Feature Score Breakdown */}
            {ring.score_breakdown && ring.score_breakdown.length > 0 && (
              <div className="inspector-section">
                <BreakdownBars breakdown={ring.score_breakdown} risk={ring.risk} />
              </div>
            )}

            {/* Decision layer: recommended action + expected-loss rationale */}
            {ring.decision && (
              <div className="inspector-section">
                <div className="inspector-section-title">
                  <Scale size={13} style={{ color: "var(--amber)" }} />
                  Recommended Action
                </div>
                <div className="explanation-box">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                      marginBottom: "6px",
                    }}
                  >
                    <strong
                      style={{
                        color:
                          ring.decision.recommended_action === "freeze"
                            ? "var(--red)"
                            : ring.decision.recommended_action === "escalate"
                            ? "var(--amber)"
                            : "var(--green)",
                        fontFamily: "var(--font-mono)",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {ring.decision.recommended_action.toUpperCase()}
                    </strong>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-dim)" }}>
                      {ring.decision.policy_version}
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                    {ring.decision.rationale}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: "6px",
                      marginTop: "8px",
                      fontFamily: "var(--font-mono)",
                      fontSize: "10px",
                    }}
                  >
                    {["freeze", "escalate", "watch"].map((act) => (
                      <div
                        key={act}
                        style={{
                          padding: "4px 6px",
                          borderRadius: "4px",
                          textAlign: "center",
                          background:
                            act === ring.decision.recommended_action
                              ? "var(--cyan-glow)"
                              : "var(--bg-deep)",
                          border: `1px solid ${
                            act === ring.decision.recommended_action
                              ? "var(--cyan-dim)"
                              : "var(--border-subtle)"
                          }`,
                          color:
                            act === ring.decision.recommended_action
                              ? "var(--cyan)"
                              : "var(--text-dim)",
                        }}
                        title={`Expected loss of ${act}: ${ring.decision.expected_loss[act]}`}
                      >
                        <div style={{ textTransform: "uppercase" }}>{act}</div>
                        <div style={{ fontWeight: 700 }}>
                          {Number(ring.decision.expected_loss[act]).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Why Was This Flagged Accordion */}
            {patterns.length > 0 && (
              <div className="expandable">
                <button
                  className={`expandable-header ${whyExpanded ? "open" : ""}`}
                  onClick={() => setWhyExpanded(!whyExpanded)}
                  aria-expanded={whyExpanded}
                >
                  <span>Why was this flagged? ({patterns.length} signals)</span>
                  <ChevronDown size={14} />
                </button>
                {whyExpanded && (
                  <div className="expandable-body">
                    <ul className="pattern-list">
                      {patterns.map((p, i) => (
                        <li key={i} style={{ marginBottom: "8px" }}>
                          <strong style={{ color: "var(--text-primary)" }}>{p.title}: </strong>
                          <span>{p.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Involved Accounts List */}
            <div className="inspector-section">
              <div className="inspector-section-title">
                <User size={13} style={{ color: "var(--cyan)" }} />
                Involved Accounts ({ring.accounts.length})
              </div>
              <div className="account-list">
                {ring.accounts.map((accId) => {
                  const meta = allMeta[accId];
                  const frozen = isAccountFrozen(accId);
                  const isSelected = state.selectedAccountId === accId;

                  return (
                    <div
                      key={accId}
                      className={`account-item ${isSelected ? "selected" : ""} ${frozen ? "frozen" : ""}`}
                      onClick={() => {
                        dispatch({ type: "SELECT_ACCOUNT", payload: accId });
                        setActiveTab("account");
                      }}
                      title="Click to inspect account dossier"
                    >
                      <div>
                        <div className="account-id">{accId}</div>
                        {meta && <div className="account-name">{meta.name}</div>}
                      </div>

                      {frozen ? (
                        <span className="frozen-tag">FROZEN</span>
                      ) : (
                        <button
                          className="btn btn-warning btn-sm"
                          style={{ padding: "2px 6px", fontSize: "10px" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            dispatch({
                              type: "SHOW_CONFIRM",
                              payload: { type: "freeze", data: { accountId: accId } },
                            });
                          }}
                          aria-label={`Freeze account ${accId}`}
                        >
                          <Snowflake size={10} /> Freeze
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ordered Transfer Sequence / Money Flow */}
            <div className="inspector-section">
              <div className="inspector-section-title">
                <ArrowRight size={13} style={{ color: "var(--red)" }} />
                Transaction Sequence ({ring.edges.length} transfers)
              </div>
              <div className="account-list">
                {ring.edges.map((edge, i) => {
                  const isStepActive = state.tracingFlow && state.traceStep === i;
                  return (
                    <div
                      key={i}
                      className="account-item"
                      style={{
                        cursor: "default",
                        borderColor: isStepActive ? "var(--cyan)" : undefined,
                        background: isStepActive ? "rgba(86, 229, 255, 0.08)" : undefined,
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "10px",
                            color: isStepActive ? "var(--cyan)" : "var(--text-dim)",
                            width: "16px",
                          }}
                        >
                          #{i + 1}
                        </span>
                        <span className="account-id" style={{ fontSize: "11px" }}>
                          {edge.from}
                        </span>
                        <ArrowRight
                          size={11}
                          style={{ color: isStepActive ? "var(--cyan)" : "var(--red)", flexShrink: 0 }}
                        />
                        <span className="account-id" style={{ fontSize: "11px" }}>
                          {edge.to}
                        </span>
                      </div>
                      <span
                        className="account-id"
                        style={{ color: isStepActive ? "var(--cyan)" : "var(--red)", fontWeight: 700 }}
                      >
                        ${edge.amount.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Investigation Action Buttons */}
            <div className="action-buttons">
              <button
                className={`btn ${state.tracingFlow ? "btn-warning" : "btn-primary"}`}
                onClick={() => dispatch({ type: "TOGGLE_TRACE" })}
                disabled={status === "Resolved"}
              >
                {state.tracingFlow ? <Square size={13} /> : <Play size={13} />}
                {state.tracingFlow ? "Halt Flow Trace" : "Trace Money Flow"}
              </button>

              <button
                className="btn btn-danger"
                onClick={() =>
                  dispatch({
                    type: "SHOW_CONFIRM",
                    payload: { type: "escalate", data: { ringId: ring.ring_id } },
                  })
                }
                disabled={status === "Escalated" || status === "Resolved"}
              >
                <AlertTriangle size={13} />
                {status === "Escalated" ? "Case Escalated" : "Escalate Case"}
              </button>

              {status === "Resolved" ? (
                <button
                  className="btn btn-ghost"
                  onClick={() => dispatch({ type: "REOPEN_RING", payload: ring.ring_id })}
                >
                  <RotateCcw size={13} /> Re-Open Investigation
                </button>
              ) : (
                <button
                  className="btn btn-ghost"
                  onClick={() =>
                    dispatch({
                      type: "SHOW_CONFIRM",
                      payload: { type: "resolve", data: { ringId: ring.ring_id } },
                    })
                  }
                >
                  <Scale size={13} /> Resolve Investigation
                </button>
              )}
            </div>

            {/* Activity Log Mini Timeline */}
            {state.activityLog.length > 0 && (
              <div className="inspector-section">
                <div className="inspector-section-title">Audit Trail & Activity Log</div>
                <div className="activity-log">
                  {state.activityLog.slice(0, 6).map((entry) => (
                    <div key={entry.id} className="activity-entry">
                      <span className={`activity-dot ${entry.type}`} />
                      <span className="activity-time">
                        {new Date(entry.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                      <span className="activity-msg">{entry.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
