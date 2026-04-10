import { useState, useEffect } from "react";
import { fetchNotificationSummary } from "../services/notificationService";

interface RoutingData {
  selectedChannel: string;
  confidence: number;
  modelVersion: string;
  features: { name: string; importance: number }[];
}

function getMockRoutingData(): RoutingData {
  return {
    selectedChannel: "email",
    confidence: 0.87,
    modelVersion: "v1.3.2",
    features: [
      { name: "Time of Day", importance: 0.34 },
      { name: "Past Open Rate", importance: 0.28 },
      { name: "Channel History", importance: 0.21 },
      { name: "Message Length", importance: 0.10 },
      { name: "Recipient Timezone", importance: 0.07 },
    ],
  };
}

const channelColors: Record<string, string> = {
  email: "#2563EB",
  sms: "#16A34A",
  websocket: "#9333EA",
  webhook: "#EA580C",
};

export default function RoutingIntelligence() {
  const [routing] = useState<RoutingData>(getMockRoutingData());
  const [totalNotifications, setTotalNotifications] = useState<number>(0);

  useEffect(() => {
    fetchNotificationSummary().then((data) => {
      setTotalNotifications(data.total);
    }).catch(() => {});
  }, []);

  const maxImportance = Math.max(...routing.features.map((f) => f.importance));

  return (
    <main style={{
      flex: 1,
      backgroundColor: "#F9FAFB",
      padding: "32px",
      minHeight: "100vh",
    }}>
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "#111827", margin: 0 }}>
          Routing Intelligence
        </h1>
        <p style={{ fontSize: "13px", color: "#9CA3AF", marginTop: "4px" }}>
          Sprint 2 · ML-powered channel selection
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>

        {/* Selected Channel Card */}
        <div style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <p style={{ fontSize: "13px", color: "#6B7280", marginBottom: "12px", fontWeight: "500" }}>
            SELECTED CHANNEL
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{
              width: "56px",
              height: "56px",
              borderRadius: "12px",
              backgroundColor: channelColors[routing.selectedChannel] ?? "#6B7280",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
            }}>
              📧
            </div>
            <div>
              <div style={{ fontSize: "24px", fontWeight: "700", color: "#111827", textTransform: "capitalize" }}>
                {routing.selectedChannel}
              </div>
              <div style={{ fontSize: "13px", color: "#6B7280" }}>
                Primary delivery channel
              </div>
            </div>
          </div>
        </div>

        {/* Confidence Score Card */}
        <div style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <p style={{ fontSize: "13px", color: "#6B7280", marginBottom: "12px", fontWeight: "500" }}>
            CONFIDENCE SCORE
          </p>
          <div style={{ fontSize: "40px", fontWeight: "700", color: "#16A34A" }}>
            {(routing.confidence * 100).toFixed(0)}%
          </div>
          <div style={{
            marginTop: "12px",
            height: "8px",
            backgroundColor: "#F3F4F6",
            borderRadius: "4px",
            overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              width: `${routing.confidence * 100}%`,
              backgroundColor: "#16A34A",
              borderRadius: "4px",
              transition: "width 0.6s ease",
            }} />
          </div>
        </div>

        {/* Model Version Card */}
        <div style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <p style={{ fontSize: "13px", color: "#6B7280", marginBottom: "12px", fontWeight: "500" }}>
            MODEL VERSION
          </p>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#111827" }}>
            {routing.modelVersion}
          </div>
          <div style={{ fontSize: "13px", color: "#6B7280", marginTop: "8px" }}>
            Trained on {totalNotifications} notifications
          </div>
          <div style={{
            marginTop: "12px",
            display: "inline-block",
            padding: "4px 10px",
            backgroundColor: "#EFF6FF",
            color: "#2563EB",
            borderRadius: "20px",
            fontSize: "12px",
            fontWeight: "600",
          }}>
            Active
          </div>
        </div>

        {/* Feature Importance Chart */}
        <div style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <p style={{ fontSize: "13px", color: "#6B7280", marginBottom: "16px", fontWeight: "500" }}>
            FEATURE IMPORTANCE
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {routing.features.map((feature) => (
              <div key={feature.name}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "13px", color: "#374151" }}>{feature.name}</span>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>
                    {(feature.importance * 100).toFixed(0)}%
                  </span>
                </div>
                <div style={{
                  height: "8px",
                  backgroundColor: "#F3F4F6",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    width: `${(feature.importance / maxImportance) * 100}%`,
                    backgroundColor: "#2563EB",
                    borderRadius: "4px",
                    transition: "width 0.6s ease",
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}