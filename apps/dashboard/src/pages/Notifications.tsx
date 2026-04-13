import NotificationsTable from "../components/NotificationsTable";

export default function Notifications() {
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
          Notifications
        </h1>
        <p style={{
          fontSize: "13px",
          color: "#9CA3AF",
          margin: "4px 0 0 0",
        }}>
          Sprint 2 · All notifications for this tenant
        </p>
      </div>

      <NotificationsTable />
    </main>
  );
}
