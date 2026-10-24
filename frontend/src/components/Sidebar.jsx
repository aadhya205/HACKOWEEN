import {
  History,
  LayoutDashboard,
  Network,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { useInvestigation } from "../context/InvestigationContext";

const navItems = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "network", label: "Live Network", icon: Network, badge: null },
  { id: "investigations", label: "Investigations", icon: Shield, badgeKey: "alerts" },
  { id: "accounts", label: "Accounts", icon: Users },
  { id: "transactions", label: "Transaction History", icon: History },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const { state, dispatch } = useInvestigation();

  return (
    <aside className="sidebar" role="navigation" aria-label="Main navigation">
      {/* Logo */}
      <div className="sidebar-logo">
        <svg className="logo-icon" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="6" fill="#10141D" stroke="#242B38" strokeWidth="1" />
          <path d="M7 8h18v1.5H7zM7 12h18v1.5H7zM7 16h12v1.5H7z" fill="#343D50" />
          <circle cx="22" cy="22" r="6.5" fill="none" stroke="#56E5FF" strokeWidth="1.2" />
          <circle cx="19.5" cy="20.5" r="1.3" fill="#56E5FF" />
          <circle cx="24.5" cy="20.5" r="1.3" fill="#FF365D" />
          <circle cx="22" cy="24.5" r="1.3" fill="#FF365D" />
          <line x1="19.5" y1="20.5" x2="24.5" y2="20.5" stroke="#56E5FF" strokeWidth="0.6" opacity="0.6" />
          <line x1="24.5" y1="20.5" x2="22" y2="24.5" stroke="#FF365D" strokeWidth="0.6" opacity="0.7" />
          <line x1="22" y1="24.5" x2="19.5" y2="20.5" stroke="#FF365D" strokeWidth="0.6" opacity="0.7" />
        </svg>
        <div className="logo-text">
          <span className="logo-title">Ledger of the Undead</span>
          <span className="logo-subtitle">Fraud Forensics</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Investigation</div>
        {navItems.slice(0, 3).map((item) => (
          <button
            key={item.id}
            className={`sidebar-link ${state.activeView === item.id ? "active" : ""}`}
            onClick={() => dispatch({ type: "SET_VIEW", payload: item.id })}
            aria-current={state.activeView === item.id ? "page" : undefined}
          >
            <item.icon />
            <span>{item.label}</span>
            {item.badgeKey === "alerts" && state.alerts.length > 0 && (
              <span className="sidebar-badge">{state.alerts.length}</span>
            )}
          </button>
        ))}

        <div className="sidebar-section-label">Data</div>
        {navItems.slice(3, 5).map((item) => (
          <button
            key={item.id}
            className={`sidebar-link ${state.activeView === item.id ? "active" : ""}`}
            onClick={() => dispatch({ type: "SET_VIEW", payload: item.id })}
            aria-current={state.activeView === item.id ? "page" : undefined}
          >
            <item.icon />
            <span>{item.label}</span>
          </button>
        ))}

        <div className="sidebar-section-label">System</div>
        {navItems.slice(5).map((item) => (
          <button
            key={item.id}
            className={`sidebar-link ${state.activeView === item.id ? "active" : ""}`}
            onClick={() => dispatch({ type: "SET_VIEW", payload: item.id })}
            aria-current={state.activeView === item.id ? "page" : undefined}
          >
            <item.icon />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="system-status">
          <span className="status-dot" />
          <span>SYSTEM READY</span>
        </div>
      </div>
    </aside>
  );
}
