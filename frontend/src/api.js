/**
 * Re-export fetchAlerts for backwards compatibility.
 */
import { fetchAlerts as fetchAlertsImpl } from "./services/api";

export async function fetchAlerts() {
  const result = await fetchAlertsImpl();
  return {
    alerts: result.data,
    count: result.data.length,
    source: result.source,
    cached: result.meta?.cached ?? false,
    generated_at: result.meta?.generated_at ?? new Date().toISOString(),
    detection_error: result.meta?.detection_error ?? null,
  };
}

export default fetchAlerts;
