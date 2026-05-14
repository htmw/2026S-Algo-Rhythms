import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

interface ModelInfo {
  loaded: boolean;
  version?: string;
  metrics?: Record<string, number>;
  feature_importance?: Record<string, number>;
  training_samples?: number;
  status?: string;
}

export function ModelMetricsPanel() {
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<ModelInfo>("/v1/routing/model")
      .then((data) => {
        if (!data.loaded) setUnavailable(true);
        else setModel(data);
      })
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{
        backgroundColor: "white", borderRadius: "12px",
        padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      }}>
        <p style={{ color: "#9CA3AF", fontSize: "14px" }}>Loading model info…</p>
      </div>
    );
  }

  if (unavailable || !model) {
    return (
      <div style={{
        backgroundColor: "white", borderRadius: "12px",
        padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        textAlign: "center",
      }}>
        <p style={{ fontSize: "32px", margin: "0 0 8px" }}>🤖</p>
        <p style={{ color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>No model trained yet.</p>
        <p style={{ color: "#9CA3AF", fontSize: "12px", marginTop: "4px" }}>
          Send notifications with adaptive routing to generate training data.
        </p>
      </div>
    );
  }

  const features = model.feature_importance
    ? Object.entries(model.feature_importance).sort(([, a], [, b]) => b - a)
    : [];
  const maxVal = features.length > 0 ? Math.max(...features.map(([, v]) => v)) : 1;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
      {/* Stats cards */}
      <div style={{
        backgroundColor: "white", borderRadius: "12px",
        padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      }}>
        <p style={{ fontSize: "13px", color: "#6B7280", fontWeight: "500", marginBottom: "16px" }}>
          MODEL METADATA
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {[
            { label: "Version", value: model.version ?? "—" },
            { label: "Training Samples", value: model.training_samples?.toLocaleString() ?? "—" },
            { label: "Status", value: model.loaded ? "Active" : "Not loaded" },
            ...(model.metrics ? Object.entries(model.metrics).map(([k, v]) => ({
              label: k.toUpperCase(),
              value: typeof v === "number" ? v.toFixed(4) : String(v),
            })) : []),
          ].map(({ label, value }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "13px", color: "#6B7280" }}>{label}</span>
              <span style={{
  fontSize: "13px", fontWeight: "600",
  padding: label === "Status" ? "2px 10px" : "0",
  backgroundColor: label === "Status" ? (model.loaded ? "#EFF6FF" : "#FEF2F2") : "transparent",
  color: label === "Status" ? (model.loaded ? "#2563EB" : "#DC2626") : "#111827",
  borderRadius: label === "Status" ? "20px" : "0",
}}>
  {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Feature importance */}
      <div style={{
        backgroundColor: "white", borderRadius: "12px",
        padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      }}>
        <p style={{ fontSize: "13px", color: "#6B7280", fontWeight: "500", marginBottom: "16px" }}>
          FEATURE IMPORTANCE
        </p>
        {features.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {features.map(([name, importance]) => (
              <div key={name}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "13px", color: "#374151" }}>{name}</span>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>
                    {(importance * 100).toFixed(1)}%
                  </span>
                </div>
                <div style={{ height: "8px", backgroundColor: "#F3F4F6", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${(importance / maxVal) * 100}%`,
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
  );
}