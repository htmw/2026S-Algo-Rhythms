import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";

interface TenantSummary {
  total: number;
  delivered: number;
  failed: number;
  queued: number;
  processing: number;
}

export default function Tenants() {
  const [summary, setSummary] = useState<TenantSummary | null>(null);
  const apiKey = import.meta.env.VITE_API_KEY ?? "";
  const keyPrefix = apiKey ? apiKey.substring(0, 16) + "..." : "not configured";

  useEffect(() => {
    apiFetch<TenantSummary>("/v1/notifications/summary")
      .then(setSummary)
      .catch(() => {});
  }, []);

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
          Tenant
        </h1>
        <p style={{
          fontSize: "13px",
          color: "#9CA3AF",
          margin: "4px 0 0 0",
        }}>
          Sprint 2 · Current tenant context
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* API Key Card */}
        <div style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <p style={{ fontSize: "13px", color: "#6B7280", marginBottom: "12px", fontWeight: "500" }}>
            API KEY
          </p>
          <div style={{
            fontSize: "16px",
            fontWeight: "600",
            color: "#111827",
            fontFamily: "monospace",
            wordBreak: "break-all",
          }}>
            {keyPrefix}
          </div>
          <div style={{ fontSize: "12px", color: "#9CA3AF", marginTop: "8px" }}>
            Configured via VITE_API_KEY environment variable
          </div>
        </div>

        {/* Usage Summary Card */}
        <div style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <p style={{ fontSize: "13px", color: "#6B7280", marginBottom: "12px", fontWeight: "500" }}>
            NOTIFICATION USAGE
          </p>
          {summary ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {[
                { label: "Total", value: summary.total, color: "#111827" },
                { label: "Delivered", value: summary.delivered, color: "#15803D" },
                { label: "Failed", value: summary.failed, color: "#DC2626" },
                { label: "Queued", value: summary.queued, color: "#A16207" },
              ].map((stat) => (
                <div key={stat.label}>
                  <div style={{ fontSize: "24px", fontWeight: "700", color: stat.color }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: "12px", color: "#6B7280" }}>{stat.label}</div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: "13px", color: "#9CA3AF" }}>Loading...</p>
          )}
        </div>
      </div>
    </main>
  );
}
