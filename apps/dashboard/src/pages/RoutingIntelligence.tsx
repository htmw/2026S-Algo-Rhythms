import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";

interface RoutingDecision {
  mode: string;
  selected: string;
  predictions: Record<string, number>;
  exploration: boolean;
  reason: string;
  model_version: string;
}

interface NotificationListItem {
  id: string;
  routing_mode: string;
  routing_decision: RoutingDecision | null;
}

interface ModelInfo {
  loaded: boolean;
  version?: string;
  metrics?: Record<string, number>;
  feature_importance?: Record<string, number>;
}

const channelColors: Record<string, string> = {
  email: "#2563EB",
  sms_webhook: "#16A34A",
  websocket: "#9333EA",
  webhook: "#EA580C",
};

export default function RoutingIntelligence() {
  const [routing, setRouting] = useState<RoutingDecision | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      // Step 1: fetch recent notifications and find one with an adaptive routing decision
      try {
        const notifResp = await apiFetch<{ data: NotificationListItem[] }>("/v1/notifications?limit=20");
        const items = notifResp.data ?? [];

        // Prefer an adaptive decision (has predictions), fall back to any decision
        const adaptive = items.find(
          (n) => n.routing_decision?.mode === "adaptive" && n.routing_decision?.predictions,
        );
        const fallback = items.find((n) => n.routing_decision != null);
        const best = adaptive ?? fallback;

        if (best?.routing_decision) {
          setRouting(best.routing_decision);
        }
      } catch {
        // API unreachable — page shows empty state
      }

      // Step 2: fetch model info via API proxy (dashboard must not call ml-service directly)
      try {
        const mlResp = await apiFetch<ModelInfo>("/v1/routing/model");
        setModelInfo(mlResp);
      } catch (err) {
        console.error("Failed to fetch model info:", err);
      }

      setLoading(false);
    };

    void fetchData();
  }, []);

  const selectedChannel = routing?.selected ?? "—";
  const confidence = routing?.predictions?.[selectedChannel] ?? 0;
  const modelVersion = routing?.model_version ?? modelInfo?.version ?? "—";
  const exploration = routing?.exploration ?? false;
  const reason = routing?.reason ?? "";

  const features = modelInfo?.feature_importance
    ? Object.entries(modelInfo.feature_importance)
        .sort(([, a], [, b]) => b - a)
        .map(([name, importance]) => ({ name, importance }))
    : [];

  const maxImportance = features.length > 0 ? Math.max(...features.map((f) => f.importance)) : 1;

  if (loading) {
    return (
      <main style={{ flex: 1, backgroundColor: "#F9FAFB", padding: "32px", minHeight: "100vh" }}>
        <p style={{ color: "#9CA3AF" }}>Loading routing data...</p>
      </main>
    );
  }

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

      {!routing && (
        <div style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          marginBottom: "20px",
          color: "#6B7280",
          fontSize: "14px",
        }}>
          No routing decisions yet. Send a notification with routing_mode: adaptive to see data here.
        </div>
      )}

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
              backgroundColor: channelColors[selectedChannel] ?? "#6B7280",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
              color: "white",
              fontWeight: "700",
            }}>
              {selectedChannel.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: "24px", fontWeight: "700", color: "#111827", textTransform: "capitalize" }}>
                {selectedChannel}
              </div>
              <div style={{ fontSize: "13px", color: "#6B7280" }}>
                {exploration ? "Exploration (random)" : "Exploitation (model pick)"}
              </div>
            </div>
          </div>
          {reason && (
            <div style={{ fontSize: "12px", color: "#9CA3AF", marginTop: "12px" }}>
              {reason}
            </div>
          )}
        </div>

        {/* Confidence Score Card */}
        <div style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <p style={{ fontSize: "13px", color: "#6B7280", marginBottom: "12px", fontWeight: "500" }}>
            PREDICTION SCORES
          </p>
          {routing?.predictions ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {Object.entries(routing.predictions)
                .sort(([, a], [, b]) => b - a)
                .map(([channel, score]) => (
                  <div key={channel}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{
                        fontSize: "13px",
                        color: channel === selectedChannel ? "#111827" : "#6B7280",
                        fontWeight: channel === selectedChannel ? "600" : "400",
                      }}>
                        {channel}
                      </span>
                      <span style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>
                        {(score * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div style={{ height: "8px", backgroundColor: "#F3F4F6", borderRadius: "4px", overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${score * 100}%`,
                        backgroundColor: channel === selectedChannel ? "#16A34A" : "#D1D5DB",
                        borderRadius: "4px",
                        transition: "width 0.6s ease",
                      }} />
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div style={{ fontSize: "40px", fontWeight: "700", color: "#16A34A" }}>
              {(confidence * 100).toFixed(0)}%
            </div>
          )}
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
          <div style={{ fontSize: "20px", fontWeight: "700", color: "#111827", wordBreak: "break-all" }}>
            {modelVersion}
          </div>
          {modelInfo?.metrics && (
            <div style={{ marginTop: "12px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
              {Object.entries(modelInfo.metrics).map(([key, val]) => (
                <div key={key} style={{ fontSize: "12px", color: "#6B7280" }}>
                  <span style={{ fontWeight: "600", color: "#374151" }}>{key}:</span>{" "}
                  {typeof val === "number" ? val.toFixed(4) : String(val)}
                </div>
              ))}
            </div>
          )}
          <div style={{
            marginTop: "12px",
            display: "inline-block",
            padding: "4px 10px",
            backgroundColor: modelInfo?.loaded ? "#EFF6FF" : "#FEF2F2",
            color: modelInfo?.loaded ? "#2563EB" : "#DC2626",
            borderRadius: "20px",
            fontSize: "12px",
            fontWeight: "600",
          }}>
            {modelInfo?.loaded ? "Active" : "Not loaded"}
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
          {features.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {features.map((feature) => (
                <div key={feature.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ fontSize: "13px", color: "#374151" }}>{feature.name}</span>
                    <span style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>
                      {(feature.importance * 100).toFixed(1)}%
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
          ) : (
            <p style={{ fontSize: "13px", color: "#9CA3AF" }}>
              No feature importance data available. Train the model first.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
