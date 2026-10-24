import { AlertTriangle, RotateCcw, Scale, Snowflake, X } from "lucide-react";
import { useState } from "react";
import { useInvestigation } from "../context/InvestigationContext";

export default function ConfirmDialog() {
  const { state, dispatch } = useInvestigation();
  const [note, setNote] = useState("");

  if (!state.showConfirmDialog) return null;

  const { type, data } = state.showConfirmDialog;

  const handleClose = () => {
    setNote("");
    dispatch({ type: "HIDE_CONFIRM" });
  };

  const handleConfirm = () => {
    switch (type) {
      case "freeze":
        dispatch({ type: "FREEZE_ACCOUNT", payload: data.accountId });
        dispatch({
          type: "ADD_TOAST",
          payload: {
            type: "warning",
            message: `Account ${data.accountId} marked: Freeze Requested — Demo`,
          },
        });
        break;
      case "escalate":
        dispatch({
          type: "ESCALATE_CASE",
          payload: { ringId: data.ringId, note },
        });
        dispatch({
          type: "ADD_TOAST",
          payload: {
            type: "success",
            message: `Simulated Case escalated for ${data.ringId}`,
          },
        });
        break;
      case "resolve":
        dispatch({ type: "RESOLVE_RING", payload: data.ringId });
        dispatch({
          type: "ADD_TOAST",
          payload: {
            type: "success",
            message: `Investigation ${data.ringId} marked as Resolved (Demo)`,
          },
        });
        break;
      case "reset":
        dispatch({ type: "RESET_DEMO" });
        dispatch({
          type: "ADD_TOAST",
          payload: { type: "info", message: "Demo forensic state has been reset to baseline" },
        });
        break;
    }
    setNote("");
  };

  const titles = {
    freeze: "Simulate Account Freeze",
    escalate: "Escalate Case to SAR Forensics",
    resolve: "Resolve Fraud Ring Investigation",
    reset: "Reset Demo Investigation State",
  };

  const icons = {
    freeze: Snowflake,
    escalate: AlertTriangle,
    resolve: Scale,
    reset: RotateCcw,
  };

  const descriptions = {
    freeze: `You are about to flag account ${data?.accountId} for a simulated administrative hold. Its visual appearance on the graph will update with an amber dashed freeze halo.`,
    escalate: `This will create a simulated case file (e.g. CASE-1042) for ${data?.ringId} and update its status to Escalated in the fraud queue.`,
    resolve: `This will mark investigation cluster ${data?.ringId} as Resolved / False-Positive review. You can re-open it at any time for judging demos.`,
    reset: "This will clear all simulated account freezes, case escalations, and resolution records, returning the forensic dashboard to its initial hackathon baseline.",
  };

  const Icon = icons[type] || AlertTriangle;

  return (
    <div
      className="dialog-overlay"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label={titles[type]}
    >
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
            <Icon
              size={18}
              style={{
                color:
                  type === "freeze"
                    ? "var(--amber)"
                    : type === "escalate"
                    ? "var(--red)"
                    : type === "resolve"
                    ? "var(--cyan)"
                    : "var(--text-secondary)",
              }}
            />
            {titles[type]}
          </h3>
          <button className="graph-toolbar-btn" onClick={handleClose}>
            <X size={14} />
          </button>
        </div>

        <div className="demo-notice" style={{ marginTop: "12px" }}>
          ⚠ SIMULATED DEMO ACTION — No real banking system or financial institution is affected.
        </div>

        <p style={{ marginTop: "12px", fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
          {descriptions[type]}
        </p>

        {type === "escalate" && (
          <div style={{ marginTop: "14px" }}>
            <label style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 600 }}>
              Investigator SAR Notes (Optional)
            </label>
            <textarea
              placeholder="e.g. Flagged automated structuring below CTR threshold. Recommend expedited subpeona on nominee shell entity."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label="Investigation notes"
              rows={3}
              style={{ marginTop: "4px" }}
            />
          </div>
        )}

        <div className="dialog-actions" style={{ marginTop: "18px" }}>
          <button className="btn btn-ghost" onClick={handleClose}>
            Cancel
          </button>
          <button
            className={`btn ${
              type === "freeze"
                ? "btn-warning"
                : type === "escalate"
                ? "btn-danger"
                : type === "reset"
                ? "btn-ghost"
                : "btn-primary"
            }`}
            onClick={handleConfirm}
          >
            {type === "freeze" && "Confirm Freeze (Demo)"}
            {type === "escalate" && "Create Case & Escalate"}
            {type === "resolve" && "Confirm Resolution"}
            {type === "reset" && "Reset Demo State"}
          </button>
        </div>
      </div>
    </div>
  );
}
