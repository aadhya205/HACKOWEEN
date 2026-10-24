import {
  ArrowDownUp,
  ArrowRight,
  Eye,
  History,
} from "lucide-react";
import { useState } from "react";
import { useInvestigation } from "../context/InvestigationContext";
import { normalEdges } from "../data/demoAlerts";

export default function TransactionsPage() {
  const { state, dispatch } = useInvestigation();
  const [filterType, setFilterType] = useState("all"); // "all" | "suspicious" | "normal"
  const [sortOrder, setSortOrder] = useState("desc"); // "desc" | "asc"

  const allEdges = [
    ...state.alerts.flatMap((a) =>
      a.edges.map((e) => ({ ...e, ringId: a.ring_id, suspicious: true, risk: a.risk }))
    ),
    ...normalEdges.map((e) => ({ ...e, ringId: null, suspicious: false, risk: 0 })),
  ];

  // Filtering
  const searched = state.searchQuery.trim()
    ? allEdges.filter(
        (e) =>
          e.from.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
          e.to.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
          (e.ringId && e.ringId.toLowerCase().includes(state.searchQuery.toLowerCase()))
      )
    : allEdges;

  const filtered = searched.filter((e) => {
    if (filterType === "suspicious") return e.suspicious;
    if (filterType === "normal") return !e.suspicious;
    return true;
  });

  // Sorting
  const sorted = [...filtered].sort((a, b) => {
    if (sortOrder === "desc") return b.amount - a.amount;
    return a.amount - b.amount;
  });

  const totalVolume = allEdges.reduce((sum, e) => sum + e.amount, 0);
  const suspiciousVolume = allEdges.filter((e) => e.suspicious).reduce((sum, e) => sum + e.amount, 0);
  const normalVolume = totalVolume - suspiciousVolume;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--space-2xl)", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Page Header */}
      <div style={{ marginBottom: "var(--space-lg)" }}>
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, display: "flex", alignItems: "center", gap: "10px" }}>
          <History size={24} style={{ color: "var(--cyan)" }} />
          Transaction Forensics Ledger
        </h1>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: "4px" }}>
          Forensic transfer journal capturing directed fund movements, hop routing, and suspicious clusters.{" "}
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
        </p>
      </div>

      {/* Volume Summary Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "var(--space-md)",
          marginBottom: "var(--space-lg)",
        }}
      >
        <div className="metric-card accent" onClick={() => setFilterType("all")} style={{ cursor: "pointer" }}>
          <div className="metric-label">Total Volume Monitored</div>
          <div className="metric-value">${totalVolume.toLocaleString()}</div>
          <div className="metric-sub">{allEdges.length} recorded transfers</div>
        </div>
        <div className="metric-card danger" onClick={() => setFilterType("suspicious")} style={{ cursor: "pointer" }}>
          <div className="metric-label">Flagged Suspicious Volume</div>
          <div className="metric-value">${suspiciousVolume.toLocaleString()}</div>
          <div className="metric-sub">{allEdges.filter((e) => e.suspicious).length} ring transfers</div>
        </div>
        <div className="metric-card" onClick={() => setFilterType("normal")} style={{ cursor: "pointer" }}>
          <div className="metric-label">Normal Transaction Volume</div>
          <div className="metric-value">${normalVolume.toLocaleString()}</div>
          <div className="metric-sub">{allEdges.filter((e) => !e.suspicious).length} benign transfers</div>
        </div>
      </div>

      {/* Filter and Sort Bar */}
      <div className="filter-bar" style={{ marginBottom: "var(--space-md)", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            className={`btn btn-sm ${filterType === "all" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilterType("all")}
          >
            All Transfers ({allEdges.length})
          </button>
          <button
            className={`btn btn-sm ${filterType === "suspicious" ? "btn-danger" : "btn-ghost"}`}
            onClick={() => setFilterType("suspicious")}
          >
            Suspicious ({allEdges.filter((e) => e.suspicious).length})
          </button>
          <button
            className={`btn btn-sm ${filterType === "normal" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilterType("normal")}
          >
            Normal ({allEdges.filter((e) => !e.suspicious).length})
          </button>
        </div>

        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
        >
          <ArrowDownUp size={12} />
          Sort: {sortOrder === "desc" ? "Highest Amount" : "Lowest Amount"}
        </button>
      </div>

      {/* Transaction Table */}
      <div
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "110px 30px 110px 140px 120px 110px 100px",
            gap: "var(--space-md)",
            padding: "var(--space-md) var(--space-lg)",
            fontSize: "var(--text-xs)",
            color: "var(--text-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 600,
            background: "var(--bg-elevated)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <span>Source</span>
          <span></span>
          <span>Destination</span>
          <span>Amount</span>
          <span>Fraud Cluster</span>
          <span>Classification</span>
          <span style={{ textAlign: "right" }}>Inspect</span>
        </div>

        {sorted.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--text-dim)", fontSize: "var(--text-sm)" }}>
            No transfers found matching filter criteria.
          </div>
        ) : (
          sorted.map((edge, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "110px 30px 110px 140px 120px 110px 100px",
                gap: "var(--space-md)",
                padding: "var(--space-md) var(--space-lg)",
                fontSize: "var(--text-sm)",
                borderBottom: "1px solid var(--border-subtle)",
                alignItems: "center",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>
                {edge.from}
              </span>
              <ArrowRight
                size={12}
                style={{ color: edge.suspicious ? "var(--red)" : "var(--cyan-dim)", alignSelf: "center" }}
              />
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>
                {edge.to}
              </span>

              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  color: edge.suspicious ? "var(--red)" : "var(--text-secondary)",
                }}
              >
                ${edge.amount.toLocaleString()}
              </span>

              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-dim)" }}>
                {edge.ringId ? (
                  <span className="ring-id-badge" style={{ fontSize: "10px", padding: "1px 6px" }}>
                    {edge.ringId}
                  </span>
                ) : (
                  "—"
                )}
              </span>

              <span>
                {edge.suspicious ? (
                  <span className="severity-badge critical" style={{ fontSize: "10px" }}>
                    FLAGGED
                  </span>
                ) : (
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-dim)" }}>Normal</span>
                )}
              </span>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  className="btn btn-primary btn-sm"
                  title="Inspect on Graph"
                  onClick={() => {
                    if (edge.ringId) {
                      dispatch({ type: "SELECT_RING", payload: edge.ringId });
                    }
                    dispatch({ type: "SELECT_ACCOUNT", payload: edge.from });
                    dispatch({ type: "SET_VIEW", payload: "dashboard" });
                  }}
                  style={{ padding: "4px 8px", fontSize: "11px" }}
                >
                  <Eye size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
