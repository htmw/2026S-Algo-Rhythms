import { NavLink } from "react-router-dom";

const navItems = [
  { label: "Dashboard",     icon: "📊", path: "/dashboard"     },
  { label: "Notifications", icon: "🔔", path: "/notifications" },
  { label: "Tenants",       icon: "🏢", path: "/tenants"       },
  { label: "Settings",      icon: "⚙️", path: "/settings"      },
  { label: "Routing", icon: "🧠", path: "/routing" },
];

export default function Sidebar() {
  return (
    <aside style={{
      width: "256px",
      minHeight: "100vh",
      backgroundColor: "#111827",
      color: "white",
      display: "flex",
      flexDirection: "column",
    }}>

      <div style={{
        padding: "20px 24px",
        borderBottom: "1px solid #374151",
      }}>
        <div style={{ fontSize: "18px", fontWeight: "700" }}>
          🔔 NotifyEngine
        </div>
        <div style={{ fontSize: "12px", color: "#9CA3AF", marginTop: "4px" }}>
          Algo-Rhythms · CS691
        </div>
      </div>

      <nav style={{ flex: 1, padding: "24px 16px" }}>
        {navItems.map((item) => (
          <NavLink
            key={item.label}
            to={item.path}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "10px 16px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "500",
              textDecoration: "none",
              marginBottom: "4px",
              backgroundColor: isActive ? "#2563EB" : "transparent",
              color: isActive ? "white" : "#9CA3AF",
            })}
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div style={{
        padding: "16px 24px",
        borderTop: "1px solid #374151",
        fontSize: "12px",
        color: "#6B7280",
      }}>
        Sprint 1 · Feb 19 – Mar 26
      </div>
    </aside>
  );
}