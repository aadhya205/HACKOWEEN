import { AlertTriangle, CheckCircle, Info, X, XCircle } from "lucide-react";
import { useInvestigation } from "../context/InvestigationContext";

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

export default function ToastContainer() {
  const { state, dispatch } = useInvestigation();

  if (state.toasts.length === 0) return null;

  return (
    <div className="toast-container" role="alert" aria-live="polite">
      {state.toasts.map((toast) => {
        const Icon = icons[toast.type] || Info;
        return (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <Icon className="toast-icon" />
            <span>{toast.message}</span>
            <button
              className="toast-dismiss"
              onClick={() => dispatch({ type: "REMOVE_TOAST", payload: toast.id })}
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
