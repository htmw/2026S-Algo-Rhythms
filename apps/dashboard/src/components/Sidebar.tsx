import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Bell,
  Building2,
  Settings,
  Brain,
  Wand2,
} from "lucide-react";
import TenantSwitcher from "./TenantSwitcher";

const navItems: { label: string; icon: ReactNode; path: string }[] = [
  { label: "Dashboard",     icon: <LayoutDashboard className="h-5 w-5" />, path: "/dashboard"     },
  { label: "Notifications", icon: <Bell className="h-5 w-5" />,            path: "/notifications" },
  { label: "Tenants",       icon: <Building2 className="h-5 w-5" />,       path: "/tenants"       },
  { label: "Settings",      icon: <Settings className="h-5 w-5" />,        path: "/settings"      },
  { label: "Routing",       icon: <Brain className="h-5 w-5" />,           path: "/routing"       },
  { label: "Simulation",   icon: <Wand2 className="h-5 w-5" />,          path: "/simulation"    },
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
        <div style={{ fontSize: "18px", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px" }}>
          <Bell className="h-5 w-5" /> NotifyEngine
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
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      <TenantSwitcher />

      <div style={{
        padding: "16px 24px",
        borderTop: "1px solid #374151",
        fontSize: "12px",
        color: "#6B7280",
      }}>
        Sprint 2 · Mar 26 – Apr 16
      </div>
    </aside>
  );
}