import { ComposeNotificationForm } from '../components/ComposeNotificationForm.js';

export function SimulationControlPanel() {
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
          Simulation Control Panel
        </h1>
        <p style={{
          fontSize: "13px",
          color: "#9CA3AF",
          margin: "4px 0 0 0",
        }}>
          Compose, predict, and simulate notification delivery
        </p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "24px",
      }}>
        <ComposeNotificationForm />
        {/* SCRUM-239: PredictionRoutingCard rendered inline in ComposeNotificationForm after send */}
        {/* SCRUM-240: ScenarioLauncher */}
        {/* SCRUM-241: EngagementResponseCard rendered inline in ComposeNotificationForm after send */}
      </div>
    </main>
  );
}
