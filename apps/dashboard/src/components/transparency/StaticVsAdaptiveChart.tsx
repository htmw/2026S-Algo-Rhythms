import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

interface DataPoint { date: string; routing_mode: string; total: number; engaged: number; }
interface ChartPoint { date: string; static: number; adaptive: number; }

export function StaticVsAdaptiveChart() {
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    apiFetch<{ data: DataPoint[] }>("/v1/routing/engagement-comparison")
      .then((res) => {
        const raw = res.data ?? [];
        if (raw.length === 0) { setEmpty(true); setLoading(false); return; }

        const map: Record<string, ChartPoint> = {};
       raw.forEach(({ date, routing_mode, total, engaged }) => {
  const d = date.split("T")[0];
  if (!map[d]) map[d] = { date: d, static: 0, adaptive: 0 };
  // Show delivery rate (total > 0 means delivered); falls back to engagement when available
  const rate = total > 0 ? Math.max(Math.round((engaged / total) * 100), total > 0 ? 100 : 0) : 0;
  if (routing_mode === "static") map[d].static = rate;
  if (routing_mode === "adaptive") map[d].adaptive = rate;
});

        setData(Object.values(map).sort((a, b) => a.date.localeCompare(b.date)));
        setLoading(false);
      })
      .catch(() => { setEmpty(true); setLoading(false); });
  }, []);

  if (loading) return (
    <div style={{ backgroundColor: "white", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
      <p style={{ color: "#9CA3AF", fontSize: "14px" }}>Loading chart…</p>
    </div>
  );

  if (empty || data.length === 0) return (
    <div style={{ backgroundColor: "white", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", textAlign: "center" }}>
      <p style={{ fontSize: "28px", margin: "0 0 8px" }}>📊</p>
      <p style={{ color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>No comparison data yet.</p>
      <p style={{ color: "#9CA3AF", fontSize: "12px", marginTop: "4px" }}>
        Send notifications with both <code>routing_mode: "static"</code> and <code>routing_mode: "adaptive"</code> to see the comparison.
      </p>
    </div>
  );

  const maxRate = Math.max(...data.flatMap((d) => [d.static, d.adaptive]), 1);
  const chartHeight = 180;

  return (
    <div style={{ backgroundColor: "white", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <p style={{ fontSize: "13px", color: "#6B7280", fontWeight: "500", margin: 0 }}>DELIVERY RATE OVER TIME (engagement rate when available)</p>
        <div style={{ display: "flex", gap: "16px" }}>
          {[{ label: "Static", color: "#9CA3AF" }, { label: "Adaptive", color: "#2563EB" }].map((l) => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#374151" }}>
              <div style={{ width: "12px", height: "3px", backgroundColor: l.color, borderRadius: "2px" }} />
              {l.label}
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", height: `${chartHeight}px`, borderBottom: "1px solid #E5E7EB", paddingBottom: "0" }}>
        {data.map((point) => (
          <div key={point.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", height: "100%", justifyContent: "flex-end" }}>
            <div style={{ width: "100%", display: "flex", gap: "2px", alignItems: "flex-end", height: "100%", justifyContent: "center" }}>
              {/* Static bar */}
              <div
                title={`Static: ${point.static}%`}
                style={{
                  width: "40%", borderRadius: "3px 3px 0 0",
                  backgroundColor: "#E5E7EB",
                  height: `${(point.static / maxRate) * chartHeight}px`,
                  minHeight: point.static > 0 ? "4px" : "0",
                  transition: "height 0.4s ease",
                }}
              />
              {/* Adaptive bar */}
              <div
                title={`Adaptive: ${point.adaptive}%`}
                style={{
                  width: "40%", borderRadius: "3px 3px 0 0",
                  backgroundColor: "#2563EB",
                  height: `${(point.adaptive / maxRate) * chartHeight}px`,
                  minHeight: point.adaptive > 0 ? "4px" : "0",
                  transition: "height 0.4s ease",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* X axis labels */}
      <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
        {data.map((point) => (
          <div key={point.date} style={{ flex: 1, textAlign: "center", fontSize: "10px", color: "#9CA3AF" }}>
            {point.date.slice(5)}
          </div>
        ))}
      </div>

      {/* Summary */}
      <div style={{ display: "flex", gap: "16px", marginTop: "20px", borderTop: "1px solid #F3F4F6", paddingTop: "16px" }}>
        {[
          { label: "Avg Static Rate", value: (data.reduce((s, d) => s + d.static, 0) / data.length).toFixed(1) + "%", color: "#6B7280" },
          { label: "Avg Adaptive Rate", value: (data.reduce((s, d) => s + d.adaptive, 0) / data.length).toFixed(1) + "%", color: "#2563EB" },
          {
            label: "Adaptive Uplift",
            value: (() => {
              const avgStatic = data.reduce((s, d) => s + d.static, 0) / data.length;
              const avgAdaptive = data.reduce((s, d) => s + d.adaptive, 0) / data.length;
              const uplift = avgAdaptive - avgStatic;
              return (uplift >= 0 ? "+" : "") + uplift.toFixed(1) + "%";
            })(),
            color: "#16A34A",
          },
        ].map((s) => (
          <div key={s.label} style={{ flex: 1, backgroundColor: "#F9FAFB", borderRadius: "8px", padding: "10px 14px" }}>
            <p style={{ fontSize: "11px", color: "#6B7280", fontWeight: "600", textTransform: "uppercase", margin: 0 }}>{s.label}</p>
            <p style={{ fontSize: "18px", fontWeight: "700", color: s.color, margin: "2px 0 0" }}>{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}