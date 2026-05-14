import { NotificationsAuditTable } from "../components/transparency/NotificationsAuditTable";
import { RecipientIntelligencePanel } from "../components/transparency/RecipientIntelligencePanel";
import { StaticVsAdaptiveChart } from "../components/transparency/StaticVsAdaptiveChart";
import { ModelMetricsPanel } from "../components/transparency/ModelMetricsPanel";


export default function DataTransparency() {
  return (
    <main style={{
      flex: 1,
      backgroundColor: "#F9FAFB",
      padding: "32px",
      minHeight: "100vh",
      overflowY: "auto",
    }}>
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "#111827", margin: 0 }}>
          Data Transparency
        </h1>
        <p style={{ fontSize: "13px", color: "#9CA3AF", marginTop: "4px" }}>
          Sprint 3 · Live ML learning evidence — notifications, engagement history, and model metrics
        </p>
      </div>

      {/* Section 1 — Notifications Audit */}
      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "15px", fontWeight: "600", color: "#374151", marginBottom: "12px" }}>
          Notifications Audit
        </h2>
        <NotificationsAuditTable />
      </section>

      {/* Section 2 — Recipient Intelligence */}
      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "15px", fontWeight: "600", color: "#374151", marginBottom: "12px" }}>
          Recipient Intelligence
        </h2>
        <RecipientIntelligencePanel />
      </section>

      {/* Section 3 — Model Metrics */}
      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "15px", fontWeight: "600", color: "#374151", marginBottom: "12px" }}>
          Model Metrics
        </h2>
        <ModelMetricsPanel />
      </section>

      {/* Section 4 — Static vs Adaptive Chart */}
<section style={{ marginBottom: "32px" }}>
  <h2 style={{ fontSize: "15px", fontWeight: "600", color: "#374151", marginBottom: "12px" }}>
    Static vs Adaptive Engagement
  </h2>
  <StaticVsAdaptiveChart />
</section>
    </main>
  );
}