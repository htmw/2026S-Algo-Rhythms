import { useState, useEffect } from "react";
import { apiFetch } from "../../lib/api";

interface Recipient { recipient: string; total_sent: number; total_engaged: number; }
interface EngagementRow { channel: string; sent: number; engaged: number; delivered: number; }

export function RecipientIntelligencePanel() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [history, setHistory] = useState<EngagementRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<{ data: Recipient[] }>("/v1/routing/recipients")
      .then((r) => setRecipients(r.data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    apiFetch<{ data: EngagementRow[] }>(`/v1/routing/recipients/${encodeURIComponent(selected)}/engagement`)
      .then((r) => setHistory(r.data ?? []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [selected]);

  const totalSent = history.reduce((s, r) => s + r.sent, 0);
  const totalEngaged = history.reduce((s, r) => s + r.engaged, 0);

  return (
    <div style={{ backgroundColor: "white", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
      <div style={{ marginBottom: "20px" }}>
        <label style={{ fontSize: "12px", fontWeight: "600", color: "#6B7280", display: "block", marginBottom: "6px" }}>
          SELECT RECIPIENT
        </label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={{ width: "100%", maxWidth: "400px", padding: "8px 12px", borderRadius: "8px", border: "1px solid #D1D5DB", fontSize: "14px", color: "#111827", backgroundColor: "white" }}
        >
          <option value="">Choose a recipient…</option>
          {recipients.map((r) => (
            <option key={r.recipient} value={r.recipient}>
              {r.recipient} ({r.total_sent} sent)
            </option>
          ))}
        </select>
      </div>

      {loading && <p style={{ color: "#9CA3AF", fontSize: "14px" }}>Loading…</p>}

      {!loading && selected && history.length === 0 && (
        <p style={{ color: "#9CA3AF", fontSize: "14px" }}>No engagement data yet for this recipient.</p>
      )}

      {!loading && history.length > 0 && (
        <>
          <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
            {[
              { label: "Total Sent", value: totalSent, color: "#2563EB" },
              { label: "Total Engaged", value: totalEngaged, color: "#16A34A" },
              { label: "Overall Rate", value: totalSent > 0 ? ((totalEngaged / totalSent) * 100).toFixed(1) + "%" : "0%", color: "#9333EA" },
            ].map((s) => (
              <div key={s.label} style={{ flex: 1, backgroundColor: "#F9FAFB", borderRadius: "8px", padding: "12px 16px" }}>
                <p style={{ fontSize: "11px", color: "#6B7280", fontWeight: "600", textTransform: "uppercase", margin: 0 }}>{s.label}</p>
                <p style={{ fontSize: "22px", fontWeight: "700", color: s.color, margin: "4px 0 0" }}>{s.value}</p>
              </div>
            ))}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #E5E7EB" }}>
                {["Channel", "Sent", "Engaged", "Rate"].map((h) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: "600", color: "#6B7280", fontSize: "11px", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((row) => {
                const rate = row.sent > 0 ? (row.engaged / row.sent) * 100 : 0;
                return (
                  <tr key={row.channel} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "10px 12px", fontWeight: "500", color: "#111827", textTransform: "capitalize" }}>{row.channel}</td>
                    <td style={{ padding: "10px 12px", color: "#374151" }}>{row.sent}</td>
                    <td style={{ padding: "10px 12px", color: "#374151" }}>{row.engaged}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ flex: 1, height: "6px", backgroundColor: "#F3F4F6", borderRadius: "3px", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${rate}%`, backgroundColor: rate > 50 ? "#16A34A" : rate > 20 ? "#F59E0B" : "#EF4444", borderRadius: "3px" }} />
                        </div>
                        <span style={{ fontSize: "12px", fontWeight: "600", color: "#374151", minWidth: "36px" }}>{rate.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {!selected && recipients.length === 0 && (
        <p style={{ color: "#9CA3AF", fontSize: "14px" }}>No recipients yet. Send notifications to see data here.</p>
      )}
    </div>
  );
}