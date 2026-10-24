import { Activity, AlertTriangle, Shield, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useInvestigation } from "../context/InvestigationContext";

function AnimatedNumber({ value, duration = 1200 }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const startTime = performance.now();
    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) {
        ref.current = requestAnimationFrame(animate);
      }
    };
    ref.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(ref.current);
  }, [value, duration]);

  return <span>{display.toLocaleString()}</span>;
}

export default function MetricCards() {
  const { state } = useInvestigation();
  const sourceLabel = state.dataSource === "backend" ? "LIVE API" : "DEMO DATA";
  const sourceStyle =
    state.dataSource === "backend"
      ? { color: "var(--green)" }
      : undefined;

  const totalAccounts = new Set(state.alerts.flatMap((a) => a.accounts)).size;
  const totalRings = state.alerts.length;
  const totalFlagged = state.alerts.reduce((sum, a) => sum + a.total_amount, 0);
  const criticalCount = state.alerts.filter((a) => a.risk >= 90).length;

  return (
    <div className="metrics-row">
      <div className="metric-card accent">
        <div className="metric-label">
          <Users size={14} />
          Accounts Analyzed
        </div>
        <div className="metric-value count-up" style={{ animationDelay: "0s" }}>
          <AnimatedNumber value={totalAccounts} />
        </div>
        <div className="metric-sub" style={sourceStyle}>{sourceLabel}</div>
      </div>

      <div className="metric-card danger">
        <div className="metric-label">
          <Shield size={14} />
          Suspicious Rings
        </div>
        <div className="metric-value count-up" style={{ animationDelay: "0.1s" }}>
          <AnimatedNumber value={totalRings} />
        </div>
        <div className="metric-sub" style={sourceStyle}>{sourceLabel}</div>
      </div>

      <div className="metric-card warning">
        <div className="metric-label">
          <Activity size={14} />
          Value Flagged
        </div>
        <div className="metric-value count-up" style={{ animationDelay: "0.2s" }}>
          $<AnimatedNumber value={totalFlagged} />
        </div>
        <div className="metric-sub" style={sourceStyle}>{sourceLabel}</div>
      </div>

      <div className="metric-card danger">
        <div className="metric-label">
          <AlertTriangle size={14} />
          Critical Risk
        </div>
        <div className="metric-value count-up" style={{ animationDelay: "0.3s" }}>
          <AnimatedNumber value={criticalCount} />
        </div>
        <div className="metric-sub" style={sourceStyle}>{sourceLabel}</div>
      </div>
    </div>
  );
}
