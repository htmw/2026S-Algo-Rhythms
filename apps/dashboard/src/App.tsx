import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Notifications from "./pages/Notifications";
import Tenants from "./pages/Tenants";
import Settings from "./pages/Settings";
import { SocketDebugPanel } from "./components/SocketDebugPanel";
import RoutingIntelligence from "./pages/RoutingIntelligence";
import { SimulationControlPanel } from "./pages/SimulationControlPanel";
import { DataTransparency } from "./pages/DataTransparency";
import { ThemeProvider } from "./contexts/ThemeContext.js";

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="flex min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
          <Sidebar />
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/tenants" element={<Tenants />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/routing" element={<RoutingIntelligence />} />
            <Route path="/simulation" element={<SimulationControlPanel />} />
            <Route path="/transparency" element={<DataTransparency />} />
          </Routes>
          <SocketDebugPanel />
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}