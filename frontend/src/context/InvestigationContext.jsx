/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useReducer, useRef } from "react";
import { fetchAlerts, getApiBaseUrl } from "../services/api";

const InvestigationContext = createContext(null);

const STORAGE_KEY = "ledger-undead-state";

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

function persistState(toSave) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    /* storage full or unavailable */
  }
}

const initialState = {
  // Data
  alerts: [],
  dataSource: "demo", // "demo" | "backend"
  apiUrl: getApiBaseUrl(),
  backendStatus: "untested", // "untested" | "checking" | "online" | "offline"
  backendError: null,
  loading: true,
  error: null,

  // Selection
  selectedRingId: null,
  selectedAccountId: null,

  // View
  activeView: "dashboard", // "dashboard" | "network" | "investigations" | "accounts" | "transactions" | "settings"
  suspiciousOnly: false,
  severityFilter: "all", // "all" | "low" | "medium" | "high" | "critical"
  statusFilter: "all", // "all" | "open" | "escalated" | "resolved"
  searchQuery: "",

  // Tracing
  tracingFlow: false,
  traceStep: -1, // Current active edge index during trace

  // Investigation actions (persisted)
  frozenAccounts: [],
  cases: [],
  resolvedRings: [],
  activityLog: [],

  // UI
  showConfirmDialog: null, // { type, data }
  showNotificationDrawer: false,
  showBackendModal: false,
  toasts: [],
};

function reducer(state, action) {
  switch (action.type) {
    case "SET_ALERTS":
      return {
        ...state,
        alerts: action.payload.alerts,
        dataSource: action.payload.source,
        loading: false,
        error: null,
        backendStatus: action.payload.source === "backend" ? "online" : "offline",
      };

    case "SET_LOADING":
      return { ...state, loading: action.payload };

    case "SET_ERROR":
      return { ...state, error: action.payload, loading: false };

    case "SET_API_URL":
      return { ...state, apiUrl: action.payload };

    case "SET_BACKEND_STATUS":
      return {
        ...state,
        backendStatus: action.payload.status,
        backendError: action.payload.error || null,
      };

    case "SELECT_RING":
      return {
        ...state,
        selectedRingId: action.payload,
        selectedAccountId: null,
        tracingFlow: false,
        traceStep: -1,
      };

    case "SELECT_ACCOUNT":
      return { ...state, selectedAccountId: action.payload };

    case "DESELECT_ALL":
      return {
        ...state,
        selectedRingId: null,
        selectedAccountId: null,
        tracingFlow: false,
        traceStep: -1,
      };

    case "SET_VIEW":
      return { ...state, activeView: action.payload };

    case "TOGGLE_SUSPICIOUS_ONLY":
      return { ...state, suspiciousOnly: !state.suspiciousOnly };

    case "SET_SEVERITY_FILTER":
      return { ...state, severityFilter: action.payload };

    case "SET_STATUS_FILTER":
      return { ...state, statusFilter: action.payload };

    case "SET_SEARCH":
      return { ...state, searchQuery: action.payload };

    case "TOGGLE_TRACE":
      return {
        ...state,
        tracingFlow: !state.tracingFlow,
        traceStep: !state.tracingFlow ? 0 : -1,
      };

    case "STOP_TRACE":
      return { ...state, tracingFlow: false, traceStep: -1 };

    case "SET_TRACE_STEP":
      return { ...state, traceStep: action.payload };

    case "FREEZE_ACCOUNT": {
      const accountId = action.payload;
      if (state.frozenAccounts.includes(accountId)) return state;
      const logEntry = {
        id: Date.now(),
        type: "freeze",
        accountId,
        timestamp: new Date().toISOString(),
        message: `Account ${accountId} marked: Freeze Requested (Simulated Demo)`,
      };
      return {
        ...state,
        frozenAccounts: [...state.frozenAccounts, accountId],
        activityLog: [logEntry, ...state.activityLog],
        showConfirmDialog: null,
      };
    }

    case "UNFREEZE_ACCOUNT": {
      const accountId = action.payload;
      const logEntry = {
        id: Date.now(),
        type: "unfreeze",
        accountId,
        timestamp: new Date().toISOString(),
        message: `Account ${accountId} freeze lift requested (Simulated Demo)`,
      };
      return {
        ...state,
        frozenAccounts: state.frozenAccounts.filter((id) => id !== accountId),
        activityLog: [logEntry, ...state.activityLog],
        showConfirmDialog: null,
      };
    }

    case "ESCALATE_CASE": {
      const { ringId, note } = action.payload;
      const caseId = `CASE-${1040 + state.cases.length + 1}`;
      const newCase = {
        caseId,
        ringId,
        note: note || "Flagged for manual fraud ring triage.",
        status: "Escalated",
        timestamp: new Date().toISOString(),
      };
      const logEntry = {
        id: Date.now(),
        type: "escalate",
        caseId,
        ringId,
        timestamp: new Date().toISOString(),
        message: `Case ${caseId} created for ${ringId} — Escalated to SAR unit (Demo)`,
      };
      return {
        ...state,
        cases: [...state.cases, newCase],
        activityLog: [logEntry, ...state.activityLog],
        showConfirmDialog: null,
      };
    }

    case "RESOLVE_RING": {
      const ringId = action.payload;
      if (state.resolvedRings.includes(ringId)) return state;
      const logEntry = {
        id: Date.now(),
        type: "resolve",
        ringId,
        timestamp: new Date().toISOString(),
        message: `Investigation ${ringId} marked as Resolved / False-Positive Review (Demo)`,
      };
      return {
        ...state,
        resolvedRings: [...state.resolvedRings, ringId],
        activityLog: [logEntry, ...state.activityLog],
        showConfirmDialog: null,
      };
    }

    case "REOPEN_RING": {
      const ringId = action.payload;
      const logEntry = {
        id: Date.now(),
        type: "reopen",
        ringId,
        timestamp: new Date().toISOString(),
        message: `Investigation ${ringId} re-opened for forensic review (Demo)`,
      };
      return {
        ...state,
        resolvedRings: state.resolvedRings.filter((id) => id !== ringId),
        activityLog: [logEntry, ...state.activityLog],
      };
    }

    case "SHOW_CONFIRM":
      return { ...state, showConfirmDialog: action.payload };

    case "HIDE_CONFIRM":
      return { ...state, showConfirmDialog: null };

    case "TOGGLE_NOTIFICATIONS":
      return { ...state, showNotificationDrawer: !state.showNotificationDrawer };

    case "CLOSE_NOTIFICATIONS":
      return { ...state, showNotificationDrawer: false };

    case "TOGGLE_BACKEND_MODAL":
      return { ...state, showBackendModal: !state.showBackendModal };

    case "CLOSE_BACKEND_MODAL":
      return { ...state, showBackendModal: false };

    case "CLEAR_ACTIVITY_LOG":
      return { ...state, activityLog: [] };

    case "ADD_TOAST": {
      const toast = { id: Date.now(), ...action.payload };
      return { ...state, toasts: [...state.toasts, toast] };
    }

    case "REMOVE_TOAST":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.payload) };

    case "RESET_DEMO": {
      const logEntry = {
        id: Date.now(),
        type: "reset",
        timestamp: new Date().toISOString(),
        message: "Forensic demo state reset to baseline",
      };
      return {
        ...state,
        frozenAccounts: [],
        cases: [],
        resolvedRings: [],
        activityLog: [logEntry],
        selectedRingId: null,
        selectedAccountId: null,
        tracingFlow: false,
        traceStep: -1,
        showConfirmDialog: null,
      };
    }

    case "RESTORE_PERSISTED":
      return {
        ...state,
        frozenAccounts: action.payload.frozenAccounts || [],
        cases: action.payload.cases || [],
        resolvedRings: action.payload.resolvedRings || [],
        activityLog: action.payload.activityLog || [],
        apiUrl: action.payload.apiUrl || state.apiUrl,
      };

    default:
      return state;
  }
}

export function InvestigationProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const prevPersistRef = useRef(null);

  // Load persisted state on mount
  useEffect(() => {
    const persisted = loadPersistedState();
    if (persisted) {
      dispatch({ type: "RESTORE_PERSISTED", payload: persisted });
    }
  }, []);

  // Fetch alerts function with backend fallback
  const checkAndLoadAlerts = useCallback(async (customUrl) => {
    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_BACKEND_STATUS", payload: { status: "checking" } });

    const result = await fetchAlerts(customUrl);
    if (result.status === "success") {
      dispatch({ type: "SET_ALERTS", payload: { alerts: result.data, source: result.source } });
      dispatch({ type: "SET_BACKEND_STATUS", payload: { status: "online" } });
    } else {
      dispatch({ type: "SET_ALERTS", payload: { alerts: result.data, source: "demo" } });
      dispatch({
        type: "SET_BACKEND_STATUS",
        payload: { status: "offline", error: result.error },
      });
    }
  }, []);

  // Initial load
  useEffect(() => {
    checkAndLoadAlerts();
  }, [checkAndLoadAlerts]);

  // Persist state changes
  useEffect(() => {
    const toSave = {
      frozenAccounts: state.frozenAccounts,
      cases: state.cases,
      resolvedRings: state.resolvedRings,
      activityLog: state.activityLog,
      apiUrl: state.apiUrl,
    };
    const key = JSON.stringify(toSave);
    if (prevPersistRef.current !== key) {
      prevPersistRef.current = key;
      persistState(toSave);
    }
  }, [state.frozenAccounts, state.cases, state.resolvedRings, state.activityLog, state.apiUrl]);

  // Auto-remove toasts after 4s
  useEffect(() => {
    if (state.toasts.length === 0) return;
    const timer = setTimeout(() => {
      dispatch({ type: "REMOVE_TOAST", payload: state.toasts[0].id });
    }, 4000);
    return () => clearTimeout(timer);
  }, [state.toasts]);

  // Helpers
  const getSelectedRing = useCallback(() => {
    return state.alerts.find((a) => a.ring_id === state.selectedRingId) || null;
  }, [state.alerts, state.selectedRingId]);

  const getRingStatus = useCallback(
    (ringId) => {
      if (state.resolvedRings.includes(ringId)) return "Resolved";
      const c = state.cases.find((c) => c.ringId === ringId);
      if (c) return c.status;
      return "Open";
    },
    [state.resolvedRings, state.cases]
  );

  const getRingCase = useCallback(
    (ringId) => {
      return state.cases.find((c) => c.ringId === ringId) || null;
    },
    [state.cases]
  );

  const getSeverity = useCallback((risk) => {
    if (risk >= 90) return "critical";
    if (risk >= 70) return "high";
    if (risk >= 40) return "medium";
    return "low";
  }, []);

  const isAccountFrozen = useCallback(
    (accountId) => state.frozenAccounts.includes(accountId),
    [state.frozenAccounts]
  );

  const getFilteredAlerts = useCallback(() => {
    let filtered = state.alerts;
    if (state.severityFilter !== "all") {
      filtered = filtered.filter((a) => getSeverity(a.risk) === state.severityFilter);
    }
    if (state.statusFilter !== "all") {
      filtered = filtered.filter((a) => getRingStatus(a.ring_id).toLowerCase() === state.statusFilter);
    }
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.trim().toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.ring_id.toLowerCase().includes(q) ||
          a.accounts.some((acc) => acc.toLowerCase().includes(q))
      );
    }
    return filtered;
  }, [state.alerts, state.severityFilter, state.statusFilter, state.searchQuery, getSeverity, getRingStatus]);

  const value = {
    state,
    dispatch,
    getSelectedRing,
    getRingStatus,
    getRingCase,
    getSeverity,
    isAccountFrozen,
    getFilteredAlerts,
    checkAndLoadAlerts,
  };

  return (
    <InvestigationContext.Provider value={value}>
      {children}
    </InvestigationContext.Provider>
  );
}

export function useInvestigation() {
  const ctx = useContext(InvestigationContext);
  if (!ctx) throw new Error("useInvestigation must be used within InvestigationProvider");
  return ctx;
}
