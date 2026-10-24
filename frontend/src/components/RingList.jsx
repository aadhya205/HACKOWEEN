import {
  AlertTriangle,
  ArrowRight,
  Eye,
  Network,
  Scale,
} from "lucide-react";
import { useInvestigation } from "../context/InvestigationContext";
import { actionSeverity, ringTypology } from "../lib/format";

export default function RingList() {
  const { state, dispatch, getSeverity, getRingStatus, getRingCase, getFilteredAlerts } =
    useInvestigation();
  const alerts = getFilteredAlerts();

  if (alerts.length === 0) {
    return (
      <div className="ring-list" style={{ padding: "40px 20px", textAlign: "center" }}>
        <Network size={36} style={{ color: "var(--text-dim)", margin: "0 auto 12px" }} />
        <h3 style={{ fontSize: "var(--text-md)", color: "var(--text-secondary)", marginBottom: "4px" }}>
          No Matching Investigations
        </h3>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--text-dim)" }}>
          Try clearing your search query or adjusting the severity and status filters.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-md)", paddingBottom: "var(--space-xl)" }}>
      {alerts.map((alert) => {
        const status = getRingStatus(alert.ring_id);
        const caseData = getRingCase(alert.ring_id);
        const severity = getSeverity(alert.risk);
        const isSelected = state.selectedRingId === alert.ring_id;
        const typology = ringTypology(alert);

        return (
          <div
            key={alert.ring_id}
            style={{
              background: isSelected ? "var(--bg-elevated)" : "var(--bg-panel)",
              border: `1px solid ${isSelected ? "var(--cyan)" : "var(--border-default)"}`,
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-lg)",
              boxShadow: isSelected ? "var(--shadow-glow-cyan)" : "var(--shadow-sm)",
              transition: "all 0.2s ease",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-md)",
            }}
          >
            {/* Header row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span className="ring-id-badge" style={{ fontSize: "14px", padding: "4px 10px" }}>
                  {alert.ring_id}
                </span>
                <span className={`status-badge ${status.toLowerCase()}`}>{status}</span>
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
                <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 500 }}>
                  {typology}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {alert.decision && (
                  <span
                    className={`severity-badge ${actionSeverity(alert.decision.recommended_action)}`}
                    title={alert.decision.rationale}
                  >
                    {alert.decision.recommended_action.toUpperCase()}
                    {alert.probability != null &&
                      ` · P=${Math.round(alert.probability * 100)}%`}
                  </span>
                )}
                <span className={`severity-badge ${severity}`}>
                  {severity.toUpperCase()} RISK ({alert.risk}/100)
                </span>
                <span
                  className="demo-badge"
                  style={
                    state.dataSource === "backend"
                      ? { color: "var(--green)", background: "var(--green-glow)" }
                      : undefined
                  }
                >
                  {state.dataSource === "backend" ? "LIVE API" : "DEMO DATA"}
                </span>
              </div>
            </div>

            {/* Explanation Brief */}
            <p style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
              {alert.explanation}
            </p>

            {/* Stats row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "var(--space-sm)",
                background: "var(--bg-deep)",
                padding: "var(--space-sm) var(--space-md)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div>
                <span style={{ fontSize: "10px", color: "var(--text-dim)", textTransform: "uppercase" }}>Flagged Volume</span>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--red)", fontSize: "14px" }}>
                  ${alert.total_amount.toLocaleString()}
                </div>
              </div>
              <div>
                <span style={{ fontSize: "10px", color: "var(--text-dim)", textTransform: "uppercase" }}>Involved Nodes</span>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-primary)", fontSize: "14px" }}>
                  {alert.accounts.length} accounts
                </div>
              </div>
              <div>
                <span style={{ fontSize: "10px", color: "var(--text-dim)", textTransform: "uppercase" }}>Suspicious Hops</span>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-primary)", fontSize: "14px" }}>
                  {alert.edges.length} transfers
                </div>
              </div>
              <div>
                <span style={{ fontSize: "10px", color: "var(--text-dim)", textTransform: "uppercase" }}>Primary Cluster Pattern</span>
                <div style={{ fontSize: "12px", color: "var(--cyan)", fontWeight: 500 }}>
                  {typology.split(" /")[0]}
                </div>
              </div>
            </div>

            {/* Accounts Pills Preview */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "10px", color: "var(--text-dim)", textTransform: "uppercase", marginRight: "4px" }}>
                Nodes:
              </span>
              {alert.accounts.map((accId) => (
                <span
                  key={accId}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    padding: "2px 6px",
                    borderRadius: "3px",
                    background: "var(--bg-deep)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {accId}
                </span>
              ))}
            </div>

            {/* Footer action buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)", marginTop: "4px" }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  dispatch({
                    type: "SHOW_CONFIRM",
                    payload: { type: "escalate", data: { ringId: alert.ring_id } },
                  });
                }}
                disabled={status === "Escalated" || status === "Resolved"}
              >
                <AlertTriangle size={12} />
                {status === "Escalated" ? "Escalated" : "Escalate"}
              </button>

              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  dispatch({
                    type: "SHOW_CONFIRM",
                    payload: { type: "resolve", data: { ringId: alert.ring_id } },
                  });
                }}
                disabled={status === "Resolved"}
              >
                <Scale size={12} />
                {status === "Resolved" ? "Resolved" : "Resolve"}
              </button>

              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  dispatch({ type: "SELECT_RING", payload: alert.ring_id });
                  dispatch({ type: "SET_VIEW", payload: "dashboard" });
                }}
              >
                <Eye size={12} />
                Investigate in Graph
                <ArrowRight size={12} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
