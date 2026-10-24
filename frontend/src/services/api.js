/**
 * API service module for connecting to the FastAPI backend.
 * 
 * Target Endpoint: GET /alerts
 * - Development: Proxied via Vite (/api -> http://127.0.0.1:8000)
 * - Production: Served by FastAPI (same origin) -> /alerts
 * - Remote / Custom: Configurable via VITE_API_BASE or VITE_API_BASE_URL
 */

import demoAlerts from "../data/demoAlerts";

export function getApiBaseUrl() {
  return (
    import.meta.env.VITE_API_BASE ||
    import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.DEV ? "/api" : "")
  ).replace(/\/$/, "");
}

/**
 * Fetch alerts from the backend.
 * Handles both direct array and the backend's { alerts: [...], count, source, ... } envelope.
 */
export async function fetchAlerts(customBaseUrl) {
  const base = (customBaseUrl !== undefined && customBaseUrl !== null && customBaseUrl !== "")
    ? customBaseUrl.replace(/\/$/, "")
    : getApiBaseUrl();

  const endpoint = `${base}/alerts`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API responded with HTTP ${response.status}: ${response.statusText}`);
    }

    const payload = await response.json();

    // The backend returns an envelope: { alerts, count, source, cached, generated_at, detection_error }
    let rawAlerts = [];
    let meta = {
      source: "backend",
      cached: false,
      detection_error: null,
      generated_at: new Date().toISOString(),
    };

    if (payload && Array.isArray(payload.alerts)) {
      rawAlerts = payload.alerts;
      meta.source = payload.source || "backend";
      meta.cached = Boolean(payload.cached);
      meta.detection_error = payload.detection_error || null;
      meta.generated_at = payload.generated_at || meta.generated_at;
    } else if (Array.isArray(payload)) {
      rawAlerts = payload;
    } else if (payload && Array.isArray(payload.data)) {
      rawAlerts = payload.data;
    } else {
      throw new Error("Unexpected response shape from /alerts (missing alerts array)");
    }

    // Validate and normalize alerts to strictly preserve shared fields
    const validatedAlerts = rawAlerts.map((item, idx) => {
      const edges = Array.isArray(item.edges)
        ? item.edges.map((e) => ({
            from: e.from ?? e.source ?? e.sender,
            to: e.to ?? e.target ?? e.receiver,
            amount: Number(e.amount) || 0,
            timestamp: e.timestamp || null,
          }))
        : [];

      return {
        ring_id: item.ring_id || `RING-${String(idx + 1).padStart(3, "0")}`,
        accounts: Array.isArray(item.accounts) ? item.accounts : [],
        edges,
        total_amount: Number(item.total_amount) || 0,
        risk: Number(item.risk) || 50,
        explanation: item.explanation || "No explanation provided by detection engine.",
        // Preserve additive backend fields
        score_breakdown: Array.isArray(item.score_breakdown) ? item.score_breakdown : [],
        explanation_source: item.explanation_source || "template",
        // Decision layer from the backend (absent on demo alerts).
        probability: Number.isFinite(Number(item.probability)) ? Number(item.probability) : null,
        decision: item.decision ?? null,
        generated_at: item.generated_at || meta.generated_at,
        isSimulated: false,
        source: meta.source,
      };
    });

    return {
      status: "success",
      source: "backend",
      data: validatedAlerts,
      meta,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      status: "error",
      source: "demo",
      error: err.name === "AbortError" ? "Backend connection timed out" : err.message,
      data: demoAlerts.map((a) => ({ ...a, isSimulated: true, source: "demo" })),
      meta: {
        source: "demo",
        cached: false,
        detection_error: err.message,
      },
    };
  }
}
