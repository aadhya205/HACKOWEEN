import RiskGauge from "./RiskGauge.jsx";
import BreakdownBars from "./BreakdownBars.jsx";
import { formatDuration, formatMoney, ringWindow } from "../lib/format.js";

export default function AlertPanel({ alert, action, onAction }) {
  const window = ringWindow(alert);

  return (
    <section className="panel detail-panel">
      <div className="detail-head">
        <div>
          <span className="eyebrow">Alert</span>
          <h2>{alert.ring_id}</h2>
          <p className="detail-sub">
            {alert.accounts.length} accounts · {alert.edges.length} transfers
          </p>
        </div>
        <RiskGauge risk={alert.risk} />
      </div>

      <div className="facts">
        <Fact label="Total moved" value={formatMoney(alert.total_amount)} />
        <Fact label="Time window" value={formatDuration(window)} />
        <Fact label="Accounts" value={alert.accounts.length} />
        <Fact label="Transfers" value={alert.edges.length} />
      </div>

      <div className="explanation">
        <div className="explanation-head">
          <span className="eyebrow">Why it&apos;s flagged</span>
          <span
            className={`source-badge ${
              ["gemini", "ollama"].includes(alert.explanation_source) ? "is-ai" : ""
            }`}
          >
            {alert.explanation_source === "gemini"
              ? "GEMINI EXPLANATION"
              : alert.explanation_source === "ollama"
                ? "LOCAL LLM EXPLANATION"
                : "TEMPLATE"}
          </span>
        </div>
        <p>{alert.explanation}</p>
      </div>

      <BreakdownBars breakdown={alert.score_breakdown} risk={alert.risk} />

      <div className="actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onAction(alert, "freeze")}
        >
          Freeze accounts
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => onAction(alert, "escalate")}
        >
          Escalate
        </button>
      </div>

      {action && (
        <p className="action-note">
          {action.kind === "freeze" ? "Frozen" : "Escalated"} at{" "}
          {new Date(action.at).toLocaleTimeString()} — recorded for this session.
        </p>
      )}
    </section>
  );
}

function Fact({ label, value }) {
  return (
    <div className="fact">
      <span className="fact-label">{label}</span>
      <strong className="fact-value">{value}</strong>
    </div>
  );
}
