import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useEngagementComparison } from "../../hooks/useEngagementComparison";

export function StaticVsAdaptiveChart() {
  const { data, isLoading, isError } = useEngagementComparison();

  if (isLoading) {
    return (
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading chart...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load comparison data. Check API connection.
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">No comparison data yet.</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Send notifications with both <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">routing_mode: "static"</code> and{" "}
          <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">routing_mode: "adaptive"</code> to see the comparison.
        </p>
      </div>
    );
  }

  const avgStatic = data.reduce((s, d) => s + d.static, 0) / data.length;
  const avgAdaptive = data.reduce((s, d) => s + d.adaptive, 0) / data.length;
  const uplift = avgAdaptive - avgStatic;

  return (
    <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => d.slice(5)}
              tick={{ fontSize: 11, fill: "#9CA3AF" }}
              stroke="#D1D5DB"
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "#9CA3AF" }}
              stroke="#D1D5DB"
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              formatter={(value: number, name: string) => [`${value}%`, name === "static" ? "Static" : "Adaptive"]}
              labelFormatter={(label: string) => `Date: ${label}`}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }}
            />
            <Legend
              formatter={(value: string) => (value === "static" ? "Static" : "Adaptive")}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="static"
              stroke="#9CA3AF"
              strokeWidth={2}
              dot={{ r: 3, fill: "#9CA3AF" }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="adaptive"
              stroke="#2563EB"
              strokeWidth={2}
              dot={{ r: 3, fill: "#2563EB" }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex gap-4 mt-5 border-t border-gray-100 dark:border-gray-700 pt-4">
        {[
          { label: "Avg Static Rate", value: avgStatic.toFixed(1) + "%", textClass: "text-gray-500 dark:text-gray-400" },
          { label: "Avg Adaptive Rate", value: avgAdaptive.toFixed(1) + "%", textClass: "text-blue-600 dark:text-blue-400" },
          {
            label: "Adaptive Uplift",
            value: (uplift >= 0 ? "+" : "") + uplift.toFixed(1) + "%",
            textClass: "text-green-600 dark:text-green-400",
          },
        ].map((s) => (
          <div key={s.label} className="flex-1 bg-gray-50 dark:bg-gray-900 rounded-lg px-3.5 py-2.5">
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold uppercase m-0">{s.label}</p>
            <p className={`text-lg font-bold mt-0.5 m-0 ${s.textClass}`}>{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
