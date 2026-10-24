const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export function formatMoney(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return numberFormat.format(value);
}

export function formatCompact(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  if (Math.abs(value) >= 1000) {
    const thousands = value / 1000;
    return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1)}k`;
  }
  return `${Math.round(value)}`;
}

export function formatDuration(seconds) {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) {
    const value = minutes < 10 ? minutes.toFixed(1).replace(/\.0$/, "") : `${Math.round(minutes)}`;
    return `${value}m`;
  }
  return `${(minutes / 60).toFixed(1).replace(/\.0$/, "")}h`;
}

export function riskClass(risk = 0) {
  if (risk >= 80) return "risk-high";
  if (risk >= 50) return "risk-mid";
  return "risk-low";
}

export function timeAgo(iso) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

// Data-driven ring typology: works for any ring id (R1, TC01..., RING-00X).
// Order matters: closed loop > fan-out+merge > fan-in > fan-out > chain.
export function ringTypology(alert) {
  const edges = alert?.edges ?? [];
  if (edges.length === 0) return "Coordinated Fraud Cluster";

  const inDeg = new Map(); // node -> Set of senders
  const outDeg = new Map(); // node -> Set of receivers
  const adj = new Map(); // node -> [receivers]
  for (const { from, to } of edges) {
    if (!inDeg.has(to)) inDeg.set(to, new Set());
    inDeg.get(to).add(from);
    if (!outDeg.has(from)) outDeg.set(from, new Set());
    outDeg.get(from).add(to);
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from).push(to);
  }

  // Cycle: walk from the first sender and see if we can come back to it.
  const start = edges[0].from;
  const stack = [...(adj.get(start) ?? [])];
  const seen = new Set([start]);
  let cycle = false;
  while (stack.length) {
    const node = stack.pop();
    if (node === start) {
      cycle = true;
      break;
    }
    if (seen.has(node)) continue;
    seen.add(node);
    stack.push(...(adj.get(node) ?? []));
  }
  if (cycle) return "Circular Round-Trip / Wash Trading";

  const maxFanIn = Math.max(0, ...[...inDeg.values()].map((s) => s.size));
  const maxFanOut = Math.max(0, ...[...outDeg.values()].map((s) => s.size));
  if (maxFanIn >= 3 && maxFanOut >= 3) return "Fan-Out \u2192 Merge Laundering Ring";
  if (maxFanIn >= 3) return "Fan-In Funnel / Mule Consolidation";
  if (maxFanOut >= 3) return "Fan-Out / Smurf Distribution";
  return "Chain Layering / Multi-Hop Pass-Through";
}

// Recommended-action styling shared by list cards and the inspector.
export function actionSeverity(action) {
  if (action === "freeze") return "critical";
  if (action === "escalate") return "medium";
  return "low";
}

// Ring active window: taken from the score breakdown ("Time window (seconds)")
// and derived from edge timestamps when the breakdown is missing.
export function ringWindow(alert) {
  const row = (alert?.score_breakdown ?? []).find((item) =>
    /time window/i.test(item.feature ?? ""),
  );
  if (row && typeof row.raw === "number") return Math.round(row.raw);

  const stamps = (alert?.edges ?? [])
    .map((edge) => edge.timestamp)
    .filter(Boolean)
    .map((stamp) => new Date(stamp).getTime())
    .filter((stamp) => !Number.isNaN(stamp));

  if (stamps.length >= 2) {
    return Math.round((Math.max(...stamps) - Math.min(...stamps)) / 1000);
  }
  return null;
}
