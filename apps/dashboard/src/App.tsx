import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Notifications from "./pages/Notifications";
import Tenants from "./pages/Tenants";
import Settings from "./pages/Settings";
import { SocketDebugPanel } from "./components/SocketDebugPanel";

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/tenants" element={<Tenants />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
        <SocketDebugPanel />
      </div>
    </BrowserRouter>
  );
}