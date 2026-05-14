import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Bell,
  Building2,
  Settings,
  Brain,
  Wand2,
  Eye,
  Sun,
  Moon,
} from "lucide-react";
import TenantSwitcher from "./TenantSwitcher";
import { useThemeContext } from "../contexts/ThemeContext.js";

const navItems: { label: string; icon: ReactNode; path: string }[] = [
  { label: "Dashboard",     icon: <LayoutDashboard className="h-5 w-5" />, path: "/dashboard"     },
  { label: "Notifications", icon: <Bell className="h-5 w-5" />,            path: "/notifications" },
  { label: "Tenants",       icon: <Building2 className="h-5 w-5" />,       path: "/tenants"       },
  { label: "Settings",      icon: <Settings className="h-5 w-5" />,        path: "/settings"      },
  { label: "Routing",       icon: <Brain className="h-5 w-5" />,           path: "/routing"       },
  { label: "Simulation",   icon: <Wand2 className="h-5 w-5" />,          path: "/simulation"    },
  { label: "Transparency", icon: <Eye className="h-5 w-5" />,            path: "/transparency"  },
];

export default function Sidebar() {
  const { isDark, toggleTheme } = useThemeContext();

  return (
    <aside style={{
      width: "256px",
      minHeight: "100vh",
      backgroundColor: isDark ? "#030712" : "#111827",
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
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
      }}>
        <button
          type="button"
          onClick={toggleTheme}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            background: "transparent",
            border: "1px solid #374151",
            borderRadius: "6px",
            padding: "6px",
            cursor: "pointer",
            color: "#9CA3AF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}