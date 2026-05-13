import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";
import { getApiKey } from "../lib/apiKey";
import { useThemeContext } from "../contexts/ThemeContext.js";

interface TenantSummary {
  total: number;
  delivered: number;
  failed: number;
  queued: number;
  processing: number;
}

export default function Tenants() {
  const [summary, setSummary] = useState<TenantSummary | null>(null);
  const { isDark } = useThemeContext();
  const apiKey = getApiKey();
  const keyPrefix = apiKey ? apiKey.substring(0, 16) + "..." : "not configured";

  useEffect(() => {
    apiFetch<TenantSummary>("/v1/notifications/summary")
      .then(setSummary)
      .catch(() => {});
  }, []);

  const cardBg = isDark ? "#1F2937" : "white";
  const cardShadow = isDark ? "none" : "0 1px 3px rgba(0,0,0,0.1)";
  const labelColor = isDark ? "#9CA3AF" : "#6B7280";
  const valueColor = isDark ? "#F3F4F6" : "#111827";
  const mutedColor = isDark ? "#6B7280" : "#9CA3AF";

  return (
    <main className="flex-1 bg-gray-50 dark:bg-gray-900 p-8 min-h-screen">
      <div className="mb-7">
        <h1 className="text-[22px] font-bold text-gray-900 dark:text-gray-100">
          Tenant
        </h1>
        <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-1">
          Current tenant context
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        <div style={{
          backgroundColor: cardBg,
          borderRadius: "12px",
          padding: "24px",
          boxShadow: cardShadow,
        }}>
          <p style={{ fontSize: "13px", color: labelColor, marginBottom: "12px", fontWeight: "500" }}>
            API KEY
          </p>
          <div style={{
            fontSize: "16px",
            fontWeight: "600",
            color: valueColor,
            fontFamily: "monospace",
            wordBreak: "break-all",
          }}>
            {keyPrefix}
          </div>
          <div style={{ fontSize: "12px", color: mutedColor, marginTop: "8px" }}>
            Configured via VITE_API_KEY environment variable
          </div>
        </div>

        <div style={{
          backgroundColor: cardBg,
          borderRadius: "12px",
          padding: "24px",
          boxShadow: cardShadow,
        }}>
          <p style={{ fontSize: "13px", color: labelColor, marginBottom: "12px", fontWeight: "500" }}>
            NOTIFICATION USAGE
          </p>
          {summary ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {[
                { label: "Total", value: summary.total, color: valueColor },
                { label: "Delivered", value: summary.delivered, color: "#15803D" },
                { label: "Failed", value: summary.failed, color: "#DC2626" },
                { label: "Queued", value: summary.queued, color: "#A16207" },
              ].map((stat) => (
                <div key={stat.label}>
                  <div style={{ fontSize: "24px", fontWeight: "700", color: stat.color }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: "12px", color: labelColor }}>{stat.label}</div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: "13px", color: mutedColor }}>Loading...</p>
          )}
        </div>
      </div>
    </main>
  );
}
