import NotificationCountRow from "../components/NotificationCountRow";
import NotificationsTable from "../components/NotificationsTable";

export default function Dashboard() {
  return (
    <main style={{
      flex: 1,
      backgroundColor: "#F9FAFB",
      padding: "32px",
      minHeight: "100vh",
    }}>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{
          fontSize: "22px",
          fontWeight: "700",
          color: "#111827",
          margin: 0,
        }}>
          Dashboard
        </h1>
        <p style={{
          fontSize: "13px",
          color: "#9CA3AF",
          marginTop: "4px",
          margin: "4px 0 0 0",
        }}>
          Sprint 1 · Auto-refreshes every 30 seconds
        </p>
      </div>

      <NotificationCountRow />

      <NotificationsTable />
    </main>
  );
}