import { useState } from "react";
import { useNotifications } from "../../hooks/useNotifications";

export function NotificationsAuditTable() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading } = useNotifications(50);
  const notifications = data?.data ?? [];

  if (isLoading) {
    return <p style={{ color: "#9CA3AF", fontSize: "14px" }}>Loading notifications...</p>;
  }

  if (notifications.length === 0) {
    return (
      <div style={{
        backgroundColor: "white",
        borderRadius: "12px",
        padding: "24px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        color: "#6B7280",
        fontSize: "14px",
      }}>
        No notifications yet. Send one via the API to see data here.
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: "white",
      borderRadius: "12px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      overflow: "hidden",
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ backgroundColor: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
            {["ID", "Recipient", "Urgency", "Category", "Channel", "Routing Reason", "Status"].map((h) => (
              <th key={h} style={{
                padding: "12px 16px",
                textAlign: "left",
                fontWeight: "600",
                color: "#6B7280",
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {notifications.map((n: any, i: number) => (
            <>
              <tr
                key={n.id}
                onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
                style={{
                  borderBottom: "1px solid #F3F4F6",
                  cursor: "pointer",
                  backgroundColor: expandedId === n.id ? "#EFF6FF" : i % 2 === 0 ? "white" : "#FAFAFA",
                }}
              >
                <td style={{ padding: "12px 16px", color: "#9CA3AF", fontFamily: "monospace" }}>
                  {n.id.slice(0, 8)}…
                </td>
                <td style={{ padding: "12px 16px", color: "#374151" }}>{n.recipient_id ?? "—"}</td>
                <td style={{ padding: "12px 16px" }}>
                  {n.content_classification?.urgency ? (
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: "12px",
                      fontSize: "11px",
                      fontWeight: "600",
                      backgroundColor: "#FEE2E2",
                      color: "#DC2626",
                    }}>
                      {n.content_classification.urgency}
                    </span>
                  ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  {n.content_classification?.category ? (
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: "12px",
                      fontSize: "11px",
                      fontWeight: "600",
                      backgroundColor: "#DBEAFE",
                      color: "#2563EB",
                    }}>
                      {n.content_classification.category}
                    </span>
                  ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                </td>
                <td style={{ padding: "12px 16px", color: "#374151", textTransform: "capitalize" }}>
                  {n.routing_decision?.selected ?? n.channel_type ?? "—"}
                </td>
                <td style={{ padding: "12px 16px", color: "#9CA3AF", maxWidth: "200px" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                    {n.routing_decision?.reason ?? "—"}
                  </span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{
                    padding: "2px 8px",
                    borderRadius: "12px",
                    fontSize: "11px",
                    fontWeight: "600",
                    backgroundColor: n.status === "delivered" ? "#DCFCE7" : n.status === "failed" ? "#FEE2E2" : "#FEF9C3",
                    color: n.status === "delivered" ? "#16A34A" : n.status === "failed" ? "#DC2626" : "#CA8A04",
                  }}>
                    {n.status}
                  </span>
                </td>
              </tr>

              {/* Expanded detail row */}
              {expandedId === n.id && (
                <tr key={`${n.id}-detail`}>
                  <td colSpan={7} style={{ padding: "16px 24px", backgroundColor: "#F8FAFF", borderBottom: "1px solid #E5E7EB" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", fontSize: "12px" }}>
                      <div>
                        <p style={{ fontWeight: "600", color: "#374151", marginBottom: "6px" }}>Content Classification</p>
                        <pre style={{ color: "#6B7280", whiteSpace: "pre-wrap", margin: 0 }}>
                          {JSON.stringify(n.content_classification ?? {}, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p style={{ fontWeight: "600", color: "#374151", marginBottom: "6px" }}>Routing Decision</p>
                        <pre style={{ color: "#6B7280", whiteSpace: "pre-wrap", margin: 0 }}>
                          {JSON.stringify(n.routing_decision ?? {}, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p style={{ fontWeight: "600", color: "#374151", marginBottom: "6px" }}>Full Notification ID</p>
                        <p style={{ color: "#9CA3AF", fontFamily: "monospace", wordBreak: "break-all" }}>{n.id}</p>
                        <p style={{ fontWeight: "600", color: "#374151", marginTop: "12px", marginBottom: "6px" }}>Created At</p>
                        <p style={{ color: "#9CA3AF" }}>{new Date(n.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}