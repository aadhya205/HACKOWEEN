import {
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import AccountsPage from "./components/AccountsPage";
import ConfirmDialog from "./components/ConfirmDialog";
import InspectorPanel from "./components/InspectorPanel";
import MetricCards from "./components/MetricCards";
import NetworkGraph from "./components/NetworkGraph";
import RingList from "./components/RingList";
import SettingsPage from "./components/SettingsPage";
import Sidebar from "./components/Sidebar";
import ToastContainer from "./components/ToastContainer";
import TopBar from "./components/TopBar";
import TransactionsPage from "./components/TransactionsPage";
import { useInvestigation } from "./context/InvestigationContext";
import { ringTypology } from "./lib/format";

function DashboardView() {
  const { state, dispatch } = useInvestigation();

  return (
    <>
      <div className="app-workspace">
        {/* Main Dashboard Hero Title */}
        <div className="dashboard-header">
          <h1>Fraud Intelligence Center</h1>
          <p className="subtitle">
            Trace suspicious transaction networks. Expose coordinated financial activity.
          </p>
        </div>

        {/* Count-Up Metric Cards */}
        <MetricCards />

        {/* Quick Ring Selector Banner */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px var(--space-xl)",
            background: "var(--bg-panel)",
            borderBottom: "1px solid var(--border-subtle)",
            overflowX: "auto",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: "var(--text-dim)",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <ShieldAlert size={12} style={{ color: "var(--red)" }} />
            Active Ring Clusters:
          </span>

          {state.alerts.map((a) => {
            const isSelected = state.selectedRingId === a.ring_id;
            return (
              <button
                key={a.ring_id}
                onClick={() => dispatch({ type: "SELECT_RING", payload: a.ring_id })}
                className={`btn btn-sm ${isSelected ? "btn-danger" : "btn-ghost"}`}
                style={{
                  fontSize: "11px",
                  padding: "3px 10px",
                  borderRadius: "var(--radius-sm)",
                  fontFamily: "var(--font-mono)",
                  whiteSpace: "nowrap",
                  borderColor: isSelected ? "var(--red)" : "var(--border-default)",
                  background: isSelected ? "var(--red-glow)" : "transparent",
                  color: isSelected ? "var(--red)" : "var(--text-secondary)",
                }}
              >
                <strong>{a.ring_id}</strong>
                <span style={{ opacity: 0.8, marginLeft: "4px" }}>
                  ({ringTypology(a).split(" /")[0]} · Risk {a.risk})
                </span>
              </button>
            );
          })}

          {state.selectedRingId && (
            <button
              onClick={() => dispatch({ type: "DESELECT_ALL" })}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: "11px", padding: "2px 6px", color: "var(--text-dim)" }}
              title="Clear ring selection and show full network"
            >
              Show All
            </button>
          )}
        </div>

        {/* Filter & Reset Bar */}
        <div className="filter-bar">
          <label>Severity</label>
          <select
            value={state.severityFilter}
            onChange={(e) => dispatch({ type: "SET_SEVERITY_FILTER", payload: e.target.value })}
            aria-label="Filter by severity"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical (90+)</option>
            <option value="high">High (70–89)</option>
            <option value="medium">Medium (40–69)</option>
            <option value="low">Low (0–39)</option>
          </select>

          <label>Case Status</label>
          <select
            value={state.statusFilter}
            onChange={(e) => dispatch({ type: "SET_STATUS_FILTER", payload: e.target.value })}
            aria-label="Filter by status"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="escalated">Escalated</option>
            <option value="resolved">Resolved</option>
          </select>

          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: "auto" }}
            onClick={() =>
              dispatch({
                type: "SHOW_CONFIRM",
                payload: { type: "reset", data: {} },
              })
            }
          >
            <RotateCcw size={12} />
            Reset Demo
          </button>
        </div>

        {/* Hero Cytoscape Fraud-Ring Graph Section */}
        <div className="graph-section">
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)", minWidth: 0, flex: 1 }}>
            <NetworkGraph />
          </div>
        </div>
      </div>
      <InspectorPanel />
    </>
  );
}

function NetworkView() {
  const { state, dispatch } = useInvestigation();

  return (
    <>
      <div className="app-workspace">
        <div
          style={{
            padding: "var(--space-md) var(--space-xl)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--bg-panel)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div>
            <h1 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: 0 }}>
              Live Forensic Network Canvas
            </h1>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", margin: 0 }}>
              Interactive topology monitor with drag-and-drop nodes, path flow velocity, and cluster isolation.
            </p>
          </div>

          <div style={{ display: "flex", gap: "6px" }}>
            {state.alerts.map((a) => (
              <button
                key={a.ring_id}
                className={`btn btn-sm ${state.selectedRingId === a.ring_id ? "btn-danger" : "btn-ghost"}`}
                onClick={() => dispatch({ type: "SELECT_RING", payload: a.ring_id })}
                style={{ fontSize: "11px", padding: "3px 8px" }}
              >
                {a.ring_id}
              </button>
            ))}
          </div>
        </div>

        <div className="graph-section" style={{ paddingTop: 0 }}>
          <NetworkGraph />
        </div>
      </div>
      <InspectorPanel />
    </>
  );
}

function InvestigationsView() {
  const { state, dispatch } = useInvestigation();

  return (
    <>
      <div className="app-workspace">
        <div style={{ padding: "var(--space-lg) var(--space-xl) var(--space-sm)" }}>
          <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>
            Fraud Ring Investigation Queue
          </h1>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
            Forensic case files detected by the graph intelligence engine.{" "}
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

        <div className="filter-bar">
          <label>Severity</label>
          <select
            value={state.severityFilter}
            onChange={(e) => dispatch({ type: "SET_SEVERITY_FILTER", payload: e.target.value })}
            aria-label="Filter by severity"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <label>Status</label>
          <select
            value={state.statusFilter}
            onChange={(e) => dispatch({ type: "SET_STATUS_FILTER", payload: e.target.value })}
            aria-label="Filter by status"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="escalated">Escalated</option>
            <option value="resolved">Resolved</option>
          </select>

          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: "auto" }}
            onClick={() =>
              dispatch({
                type: "SHOW_CONFIRM",
                payload: { type: "reset", data: {} },
              })
            }
          >
            <RotateCcw size={12} />
            Reset Demo
          </button>
        </div>

        <div style={{ padding: "var(--space-md) var(--space-xl)", overflow: "auto", flex: 1 }}>
          <RingList />
        </div>
      </div>
      <InspectorPanel />
    </>
  );
}

function LoadingView() {
  return (
    <div className="placeholder-page">
      <div
        className="scan-indicator"
        style={{ position: "relative", width: "240px", height: "3px", overflow: "hidden", margin: "0 auto 16px" }}
      />
      <h2>Initializing Underworld Forensic Engine…</h2>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-dim)" }}>
        Loading transaction ledger graphs and risk models
      </p>
    </div>
  );
}

function AppContent() {
  const { state } = useInvestigation();

  if (state.loading) return <LoadingView />;

  const viewMap = {
    dashboard: DashboardView,
    network: NetworkView,
    investigations: InvestigationsView,
    accounts: AccountsPage,
    transactions: TransactionsPage,
    settings: SettingsPage,
  };

  const View = viewMap[state.activeView] || DashboardView;

  return <View />;
}

export default function App() {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-main">
        <TopBar />
        <div className="app-content">
          <AppContent />
        </div>
      </div>
      <ConfirmDialog />
      <ToastContainer />
    </div>
  );
}
