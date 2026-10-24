import {
  Eye,
  RotateCcw,
  Snowflake,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useInvestigation } from "../context/InvestigationContext";
import { accountMetadata, normalAccountMetadata } from "../data/demoAlerts";

export default function AccountsPage() {
  const { state, dispatch, isAccountFrozen } = useInvestigation();
  const [filterType, setFilterType] = useState("all"); // "all" | "suspicious" | "frozen" | "normal"
  const allMeta = { ...normalAccountMetadata, ...accountMetadata };

  const suspiciousIds = new Set(state.alerts.flatMap((a) => a.accounts));
  const allAccounts = Object.entries(allMeta).map(([id, meta]) => ({
    id,
    ...meta,
    suspicious: suspiciousIds.has(id),
    frozen: isAccountFrozen(id),
  }));

  // Filtering
  const searched = state.searchQuery.trim()
    ? allAccounts.filter(
        (a) =>
          a.id.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
          a.name.toLowerCase().includes(state.searchQuery.toLowerCase())
      )
    : allAccounts;

  const filtered = searched.filter((a) => {
    if (filterType === "suspicious") return a.suspicious;
    if (filterType === "frozen") return a.frozen;
    if (filterType === "normal") return !a.suspicious;
    return true;
  });

  const totalSuspicious = allAccounts.filter((a) => a.suspicious).length;
  const totalFrozen = allAccounts.filter((a) => a.frozen).length;
  const totalNormal = allAccounts.filter((a) => !a.suspicious).length;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--space-2xl)", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Page Header */}
      <div style={{ marginBottom: "var(--space-lg)" }}>
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, display: "flex", alignItems: "center", gap: "10px" }}>
          <Users size={24} style={{ color: "var(--cyan)" }} />
          Account Forensics Registry
        </h1>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: "4px" }}>
          Full entity registry of analyzed transaction endpoints across monitored jurisdictions.{" "}
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

      {/* Metric Counters */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--space-md)",
          marginBottom: "var(--space-lg)",
        }}
      >
        <div className="metric-card accent" onClick={() => setFilterType("all")} style={{ cursor: "pointer" }}>
          <div className="metric-label">Total Accounts</div>
          <div className="metric-value">{allAccounts.length}</div>
          <div className="metric-sub">Across All Networks</div>
        </div>
        <div className="metric-card danger" onClick={() => setFilterType("suspicious")} style={{ cursor: "pointer" }}>
          <div className="metric-label">Flagged Suspicious</div>
          <div className="metric-value">{totalSuspicious}</div>
          <div className="metric-sub">Fraud Ring Associated</div>
        </div>
        <div className="metric-card warning" onClick={() => setFilterType("frozen")} style={{ cursor: "pointer" }}>
          <div className="metric-label">Freeze Requested</div>
          <div className="metric-value">{totalFrozen}</div>
          <div className="metric-sub">Simulated Hold Placed</div>
        </div>
        <div className="metric-card" onClick={() => setFilterType("normal")} style={{ cursor: "pointer" }}>
          <div className="metric-label">Benign / Normal</div>
          <div className="metric-value">{totalNormal}</div>
          <div className="metric-sub">Clear Background Baseline</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="filter-bar" style={{ marginBottom: "var(--space-md)" }}>
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            className={`btn btn-sm ${filterType === "all" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilterType("all")}
          >
            All Accounts ({allAccounts.length})
          </button>
          <button
            className={`btn btn-sm ${filterType === "suspicious" ? "btn-danger" : "btn-ghost"}`}
            onClick={() => setFilterType("suspicious")}
          >
            Suspicious ({totalSuspicious})
          </button>
          <button
            className={`btn btn-sm ${filterType === "frozen" ? "btn-warning" : "btn-ghost"}`}
            onClick={() => setFilterType("frozen")}
          >
            Frozen ({totalFrozen})
          </button>
          <button
            className={`btn btn-sm ${filterType === "normal" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilterType("normal")}
          >
            Normal ({totalNormal})
          </button>
        </div>
      </div>

      {/* Account Table */}
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
            gridTemplateColumns: "110px 1.5fr 100px 90px 110px 110px 120px",
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
          <span>Account ID</span>
          <span>Entity Name</span>
          <span>Type</span>
          <span>Region</span>
          <span>Opened</span>
          <span>Status</span>
          <span style={{ textAlign: "right" }}>Actions</span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--text-dim)", fontSize: "var(--text-sm)" }}>
            No accounts match the current filter.
          </div>
        ) : (
          filtered.map((acc) => (
            <div
              key={acc.id}
              style={{
                display: "grid",
                gridTemplateColumns: "110px 1.5fr 100px 90px 110px 110px 120px",
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
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: acc.suspicious ? "var(--red)" : "var(--cyan)" }}>
                {acc.id}
              </span>
              <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{acc.name}</span>
              <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-xs)" }}>{acc.type}</span>
              <span style={{ color: "var(--cyan-dim)", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>
                {acc.region}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-dim)" }}>
                {acc.opened}
              </span>
              <span>
                {acc.frozen ? (
                  <span className="frozen-tag">FROZEN (DEMO)</span>
                ) : acc.suspicious ? (
                  <span className="severity-badge critical" style={{ fontSize: "10px" }}>FLAGGED</span>
                ) : (
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-dim)" }}>Normal</span>
                )}
              </span>

              <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                {acc.frozen ? (
                  <button
                    className="btn btn-ghost btn-sm"
                    title="Lift Freeze"
                    onClick={() => dispatch({ type: "UNFREEZE_ACCOUNT", payload: acc.id })}
                    style={{ padding: "4px" }}
                  >
                    <RotateCcw size={12} />
                  </button>
                ) : (
                  <button
                    className="btn btn-warning btn-sm"
                    title="Freeze Account (Demo)"
                    onClick={() =>
                      dispatch({
                        type: "SHOW_CONFIRM",
                        payload: { type: "freeze", data: { accountId: acc.id } },
                      })
                    }
                    style={{ padding: "4px" }}
                  >
                    <Snowflake size={12} />
                  </button>
                )}

                <button
                  className="btn btn-primary btn-sm"
                  title="View on Graph"
                  onClick={() => {
                    dispatch({ type: "SELECT_ACCOUNT", payload: acc.id });
                    const ring = state.alerts.find((a) => a.accounts.includes(acc.id));
                    if (ring) {
                      dispatch({ type: "SELECT_RING", payload: ring.ring_id });
                    }
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
